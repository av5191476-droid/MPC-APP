// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPolicyHook, MODULE_TYPE_HOOK, AUTH_MPC} from "../interfaces/IModules.sol";

/// @title SpendingPolicyHook (FR-013 a FR-016)
/// @notice Límite por token y periodo. Por encima del límite exige nivel ≥ MPC
///         (firma compuesta passkey + MPC en la práctica). Relajar tarda 48 h; endurecer es inmediato.
/// @dev Límite en unidades de token mientras FR-013 siga sin aclarar (USD vs token).
///      `approve`/`increaseAllowance` cuentan como gasto potencial: un approve ilimitado
///      siempre exige firma fuerte.
///      Limitación conocida: la llave MPC raíz puede re-delegar 7702 y saltarse todo esto.
///      El hook protege contra quien solo tiene la passkey; contra D+S comprometidos
///      protege el servidor (se niega a co-firmar desinstalaciones o re-delegaciones sin aviso de 48 h).
contract SpendingPolicyHook is IPolicyHook {
    uint32 public constant RELAX_DELAY = 48 hours;

    bytes4 internal constant TRANSFER = 0xa9059cbb; // transfer(address,uint256)
    bytes4 internal constant TRANSFER_FROM = 0x23b872dd; // transferFrom(address,address,uint256)
    bytes4 internal constant APPROVE = 0x095ea7b3; // approve(address,uint256)
    bytes4 internal constant INCREASE_ALLOWANCE = 0x39509351; // increaseAllowance(address,uint256)

    struct Limit {
        uint128 amount;
        uint32 period; // 0 = sin límite configurado
        uint128 spent;
        uint48 windowStart;
    }

    struct Pending {
        uint128 amount;
        uint32 period;
        uint48 effectiveAt;
    }

    struct AllowEntry {
        uint128 limit;
        uint48 effectiveAt;
        uint128 spent;
        uint48 windowStart;
    }

    mapping(address account => mapping(address token => Limit)) public limits;
    mapping(address account => mapping(address token => Pending)) public pending;
    mapping(address account => mapping(address token => mapping(address to => AllowEntry))) public allowlist;

    event LimitSet(address indexed account, address indexed token, uint128 amount, uint32 period);
    event LimitProposed(address indexed account, address indexed token, uint128 amount, uint32 period, uint48 effectiveAt);
    event PendingCancelled(address indexed account, address indexed token);
    event AllowlistAdded(address indexed account, address indexed token, address indexed to, uint128 limit, uint48 effectiveAt);
    event AllowlistRemoved(address indexed account, address indexed token, address indexed to);
    event Spent(address indexed account, address indexed token, uint256 amount, uint8 authLevel);

    error LimitExceeded(uint256 cap, uint256 attempted);
    error NotATightening();
    error InvalidPeriod();
    error NothingPending();
    error TimelockActive(uint48 effectiveAt);

    // ─────────────────────────── Ciclo de vida ───────────────────────────

    /// @param data abi.encode(address[] tokens, uint128[] amounts, uint32[] periods)
    function onInstall(bytes calldata data) external {
        (address[] memory tokens, uint128[] memory amounts, uint32[] memory periods) =
            abi.decode(data, (address[], uint128[], uint32[]));
        for (uint256 i; i < tokens.length; ++i) {
            if (periods[i] == 0) revert InvalidPeriod();
            limits[msg.sender][tokens[i]] = Limit(amounts[i], periods[i], 0, uint48(block.timestamp));
            emit LimitSet(msg.sender, tokens[i], amounts[i], periods[i]);
        }
    }

    /// @param data abi.encode(address[] tokens)
    function onUninstall(bytes calldata data) external {
        address[] memory tokens = abi.decode(data, (address[]));
        for (uint256 i; i < tokens.length; ++i) {
            delete limits[msg.sender][tokens[i]];
            delete pending[msg.sender][tokens[i]];
        }
    }

    function isModuleType(uint256 typeId) external pure returns (bool) {
        return typeId == MODULE_TYPE_HOOK;
    }

    // ─────────────────────────── Hook ───────────────────────────

    function checkExecution(uint8 authLevel, address target, uint256 value, bytes calldata data) external {
        address account = msg.sender;
        bool strong = authLevel >= AUTH_MPC;

        if (value != 0) _spend(account, address(0), target, value, strong, authLevel);
        if (data.length < 4) return;

        bytes4 sel = bytes4(data[:4]);
        if (sel == TRANSFER || sel == APPROVE || sel == INCREASE_ALLOWANCE) {
            (address to, uint256 amount) = abi.decode(data[4:], (address, uint256));
            _spend(account, target, to, amount, strong, authLevel);
        } else if (sel == TRANSFER_FROM) {
            (address from, address to, uint256 amount) = abi.decode(data[4:], (address, address, uint256));
            if (from == account) _spend(account, target, to, amount, strong, authLevel);
        }
    }

    // ─────────────────────────── Configuración (msg.sender = cuenta) ───────────────────────────

    /// @notice Solo endurece: monto menor o igual y periodo mayor o igual. Inmediato.
    function setLimit(address token, uint128 amount, uint32 period) external {
        if (period == 0) revert InvalidPeriod();
        Limit storage l = limits[msg.sender][token];
        bool tightening = l.period == 0 || (amount <= l.amount && period >= l.period);
        if (!tightening) revert NotATightening();
        l.amount = amount;
        l.period = period;
        delete pending[msg.sender][token];
        emit LimitSet(msg.sender, token, amount, period);
    }

    /// @notice Cualquier cambio (incluido relajar). Efectivo tras 48 h.
    function proposeLimit(address token, uint128 amount, uint32 period) external {
        if (period == 0) revert InvalidPeriod();
        uint48 effectiveAt = uint48(block.timestamp + RELAX_DELAY);
        pending[msg.sender][token] = Pending(amount, period, effectiveAt);
        emit LimitProposed(msg.sender, token, amount, period, effectiveAt);
    }

    /// @notice Permisionless: cualquiera puede aplicar un cambio cuyo timelock venció.
    function applyPending(address account, address token) external {
        Pending memory p = pending[account][token];
        if (p.effectiveAt == 0) revert NothingPending();
        if (block.timestamp < p.effectiveAt) revert TimelockActive(p.effectiveAt);
        Limit storage l = limits[account][token];
        l.amount = p.amount;
        l.period = p.period;
        delete pending[account][token];
        emit LimitSet(account, token, p.amount, p.period);
    }

    function cancelPending(address token) external {
        if (pending[msg.sender][token].effectiveAt == 0) revert NothingPending();
        delete pending[msg.sender][token];
        emit PendingCancelled(msg.sender, token);
    }

    function addAllowlist(address token, address to, uint128 limit) external {
        uint48 effectiveAt = uint48(block.timestamp + RELAX_DELAY);
        allowlist[msg.sender][token][to] = AllowEntry(limit, effectiveAt, 0, uint48(block.timestamp));
        emit AllowlistAdded(msg.sender, token, to, limit, effectiveAt);
    }

    function removeAllowlist(address token, address to) external {
        delete allowlist[msg.sender][token][to];
        emit AllowlistRemoved(msg.sender, token, to);
    }

    // ─────────────────────────── Internos ───────────────────────────

    function _spend(address account, address token, address to, uint256 amount, bool strong, uint8 authLevel)
        internal
    {
        if (amount == 0) return;
        Limit storage l = limits[account][token];
        if (l.period == 0) return; // token sin política

        AllowEntry storage a = allowlist[account][token][to];
        if (a.limit != 0 && a.effectiveAt <= block.timestamp) {
            (a.spent, a.windowStart) = _consume(a.limit, l.period, a.spent, a.windowStart, amount, strong);
        } else {
            (l.spent, l.windowStart) = _consume(l.amount, l.period, l.spent, l.windowStart, amount, strong);
        }
        emit Spent(account, token, amount, authLevel);
    }

    function _consume(uint128 cap, uint32 period, uint128 spent, uint48 start, uint256 amount, bool strong)
        internal
        view
        returns (uint128, uint48)
    {
        if (block.timestamp >= uint256(start) + period) {
            spent = 0;
            start = uint48(block.timestamp);
        }
        uint256 total = uint256(spent) + amount;
        if (total > cap && !strong) revert LimitExceeded(cap, total);
        return (total > type(uint128).max ? type(uint128).max : uint128(total), start);
    }
}
