// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IModule, IExecutorHost, MODULE_TYPE_EXECUTOR} from "../interfaces/IModules.sol";

/// @title GuardianRecovery (FR-018, research R5)
/// @notice M-de-N guardianes aprueban un lote de ejecuciones (rotar passkey o barrer activos
///         a una cuenta nueva). Se ejecuta tras un timelock ≥ 72 h; el titular puede cancelar.
/// @dev Guardianes EOA o contratos ERC-1271 (passkeys de terceros, servicio de recuperación).
///      Firmas = abi.encode(address guardian, bytes sig)[], ordenadas por dirección ascendente.
contract GuardianRecovery is IModule {
    uint32 public constant MIN_DELAY = 72 hours;
    uint256 public constant MAX_GUARDIANS = 5;
    bytes32 internal constant MODE_BATCH = bytes32(uint256(1) << 248);

    struct Config {
        address[] guardians;
        uint8 threshold;
        uint32 delay;
        uint64 nonce;
    }

    struct Request {
        bytes32 callHash;
        uint48 executeAfter;
    }

    mapping(address account => Config) internal _configs;
    mapping(address account => mapping(address guardian => bool)) public isGuardian;
    mapping(address account => Request) public requests;

    event Configured(address indexed account, uint8 threshold, uint32 delay, uint256 guardians);
    event RecoveryInitiated(address indexed account, bytes32 callHash, uint48 executeAfter);
    event RecoveryCancelled(address indexed account);
    event RecoveryExecuted(address indexed account, bytes32 callHash);

    error InvalidConfig();
    error RequestActive();
    error NoRequest();
    error NotEnoughApprovals(uint256 valid, uint8 threshold);
    error UnsortedOrDuplicate();
    error NotGuardian(address who);
    error BadGuardianSignature(address guardian);
    error CallMismatch();
    error TimelockActive(uint48 executeAfter);

    // ─────────────────────────── Ciclo de vida ───────────────────────────

    function onInstall(bytes calldata data) external {
        (address[] memory guardians, uint8 threshold, uint32 delay) = abi.decode(data, (address[], uint8, uint32));
        _configure(msg.sender, guardians, threshold, delay);
    }

    function onUninstall(bytes calldata) external {
        _clear(msg.sender);
        delete _configs[msg.sender];
        delete requests[msg.sender];
    }

    function isModuleType(uint256 typeId) external pure returns (bool) {
        return typeId == MODULE_TYPE_EXECUTOR;
    }

    /// @notice msg.sender = cuenta (requiere nivel MPC). Cancela cualquier solicitud en curso.
    function configure(address[] calldata guardians, uint8 threshold, uint32 delay) external {
        _configure(msg.sender, guardians, threshold, delay);
    }

    // ─────────────────────────── Flujo ───────────────────────────

    function recoveryDigest(address account, bytes calldata executionCalldata) public view returns (bytes32) {
        return MessageHashUtils.toEthSignedMessageHash(
            keccak256(
                abi.encode(
                    "hybridwallet.recovery.v1",
                    block.chainid,
                    address(this),
                    account,
                    _configs[account].nonce,
                    keccak256(executionCalldata)
                )
            )
        );
    }

    /// @param executionCalldata abi.encode(Execution[]) que se ejecutará en modo batch.
    function initiate(address account, bytes calldata executionCalldata, bytes[] calldata approvals) external {
        Config storage c = _configs[account];
        if (c.threshold == 0) revert InvalidConfig();
        if (requests[account].executeAfter != 0) revert RequestActive();

        bytes32 digest = recoveryDigest(account, executionCalldata);
        address last;
        uint256 valid;
        for (uint256 i; i < approvals.length; ++i) {
            (address guardian, bytes memory sig) = abi.decode(approvals[i], (address, bytes));
            if (guardian <= last) revert UnsortedOrDuplicate();
            last = guardian;
            if (!isGuardian[account][guardian]) revert NotGuardian(guardian);
            if (!SignatureChecker.isValidSignatureNow(guardian, digest, sig)) revert BadGuardianSignature(guardian);
            ++valid;
        }
        if (valid < c.threshold) revert NotEnoughApprovals(valid, c.threshold);

        unchecked {
            ++c.nonce;
        }
        uint48 executeAfter = uint48(block.timestamp + c.delay);
        bytes32 callHash = keccak256(executionCalldata);
        requests[account] = Request(callHash, executeAfter);
        emit RecoveryInitiated(account, callHash, executeAfter);
    }

    /// @notice El titular (MPC o passkey sola: es un selector "solo endurece") cancela.
    function cancel() external {
        if (requests[msg.sender].executeAfter == 0) revert NoRequest();
        delete requests[msg.sender];
        emit RecoveryCancelled(msg.sender);
    }

    /// @notice Permisionless tras el timelock.
    function execute(address account, bytes calldata executionCalldata) external {
        Request memory r = requests[account];
        if (r.executeAfter == 0) revert NoRequest();
        if (keccak256(executionCalldata) != r.callHash) revert CallMismatch();
        if (block.timestamp < r.executeAfter) revert TimelockActive(r.executeAfter);
        delete requests[account];
        IExecutorHost(account).executeFromExecutor(MODE_BATCH, executionCalldata);
        emit RecoveryExecuted(account, r.callHash);
    }

    function config(address account) external view returns (address[] memory, uint8, uint32, uint64) {
        Config storage c = _configs[account];
        return (c.guardians, c.threshold, c.delay, c.nonce);
    }

    // ─────────────────────────── Internos ───────────────────────────

    function _configure(address account, address[] memory guardians, uint8 threshold, uint32 delay) internal {
        uint256 n = guardians.length;
        if (n == 0 || n > MAX_GUARDIANS || threshold == 0 || threshold > n || delay < MIN_DELAY) {
            revert InvalidConfig();
        }
        _clear(account);
        for (uint256 i; i < n; ++i) {
            if (guardians[i] == address(0) || isGuardian[account][guardians[i]]) revert InvalidConfig();
            isGuardian[account][guardians[i]] = true;
        }
        Config storage c = _configs[account];
        c.guardians = guardians;
        c.threshold = threshold;
        c.delay = delay;
        delete requests[account];
        emit Configured(account, threshold, delay, n);
    }

    function _clear(address account) internal {
        address[] storage gs = _configs[account].guardians;
        for (uint256 i; i < gs.length; ++i) {
            delete isGuardian[account][gs[i]];
        }
    }
}
