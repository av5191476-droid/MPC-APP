// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IAccount, IAccountExecute, PackedUserOperation} from "../interfaces/IERC4337.sol";
import {
    IModule,
    IValidator,
    IPolicyHook,
    ITightenOnly,
    MODULE_TYPE_VALIDATOR,
    MODULE_TYPE_EXECUTOR,
    MODULE_TYPE_HOOK,
    AUTH_PASSKEY,
    AUTH_MPC,
    AUTH_COMPOSITE,
    AUTH_RECOVERY
} from "../interfaces/IModules.sol";

/// @title HybridAccount
/// @notice Implementación a la que se delega (EIP-7702) el EOA cuya llave es MPC 2-de-3.
///         address(this) ES el EOA: la firma ECDSA raíz se valida contra address(this).
///
/// Formato de firma de UserOp (el validador se elige con los 20 bytes altos de la nonce key):
///   - validador = address(0) → firma ECDSA de 65 bytes de la llave MPC.
///   - validador = módulo     → 0x00 ‖ firmaDelMódulo
///                            → 0x01 ‖ abi.encode(firmaDelMódulo, firmaMPC)   (compuesta)
///   El prefijo explícito evita que una firma de módulo cuyo primer byte sea 0x01 se lea
///   como compuesta.
///
/// Nivel de autorización: se deriva de la propia UserOp en executeUserOp, no de transient
/// storage. Con transient storage, dos UserOps de la misma cuenta en un bundle validan antes
/// de ejecutar y la segunda sobreescribe la marca de la primera.
contract HybridAccount is IAccount, IAccountExecute {
    address public immutable ENTRY_POINT;

    bytes1 internal constant CALLTYPE_SINGLE = 0x00;
    bytes1 internal constant CALLTYPE_BATCH = 0x01;
    bytes1 internal constant SIG_SINGLE = 0x00;
    bytes1 internal constant SIG_COMPOSITE = 0x01;
    uint256 internal constant SIG_VALIDATION_FAILED = 1;
    bytes4 internal constant ERC1271_OK = 0x1626ba7e;
    bytes4 internal constant ERC1271_FAIL = 0xffffffff;

    struct Execution {
        address target;
        uint256 value;
        bytes callData;
    }

    /// @custom:storage-location erc7201:hybridwallet.account.v1
    struct AccountStorage {
        mapping(address module => bool) installed;
        mapping(address validator => bool) validators;
        mapping(address validator => uint8) validatorLevel;
        mapping(address executor => bool) executors;
        address hook;
    }

    // keccak256(abi.encode(uint256(keccak256("hybridwallet.account.v1")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant STORAGE_SLOT = 0xf563caf46456a0f05d692a206dbb11545027f92383300abe5a768c6a88442100;

    error OnlyEntryPoint();
    error OnlySelf();
    error AdminRequiresMpc(address target, bytes4 selector);
    error UnsupportedCallType(bytes1 callType);
    error ModuleNotInstalled(address module);
    error ModuleAlreadyInstalled(address module);
    error InvalidModule(address module, uint256 typeId);
    error DirectExecuteDisabled();
    error MalformedExecution();

    event ModuleInstalled(uint256 indexed typeId, address indexed module);
    event ModuleUninstalled(uint256 indexed typeId, address indexed module);

    constructor(address entryPoint) {
        ENTRY_POINT = entryPoint;
    }

    receive() external payable {}

    // ─────────────────────────────── ERC-4337 ───────────────────────────────

    function validateUserOp(PackedUserOperation calldata op, bytes32 opHash, uint256 missingAccountFunds)
        external
        returns (uint256 validationData)
    {
        if (msg.sender != ENTRY_POINT) revert OnlyEntryPoint();
        validationData = _validate(op, opHash);
        if (missingAccountFunds != 0) {
            // EntryPoint verifica el depósito; ignorar el resultado es el patrón de referencia.
            (bool ok,) = payable(msg.sender).call{value: missingAccountFunds}("");
            ok;
        }
    }

    function executeUserOp(PackedUserOperation calldata op, bytes32) external {
        if (msg.sender != ENTRY_POINT) revert OnlyEntryPoint();
        (bytes32 mode, bytes memory executionCalldata) = abi.decode(op.callData[4:], (bytes32, bytes));
        _execute(mode, executionCalldata, _authLevel(op));
    }

    /// @notice Ruta raíz: el propio EOA envía una transacción tipo 4 a sí mismo (sin bundler).
    ///         Cualquier otra llamada directa está deshabilitada.
    function execute(bytes32 mode, bytes calldata executionCalldata) external payable {
        if (msg.sender != address(this)) revert DirectExecuteDisabled();
        _execute(mode, executionCalldata, AUTH_MPC);
    }

    /// @notice Executors instalados (GuardianRecovery) tras su timelock.
    function executeFromExecutor(bytes32 mode, bytes calldata executionCalldata)
        external
        payable
        returns (bytes[] memory)
    {
        if (!_s().executors[msg.sender]) revert ModuleNotInstalled(msg.sender);
        return _execute(mode, executionCalldata, AUTH_RECOVERY);
    }

    // ─────────────────────────────── ERC-7579 ───────────────────────────────

    /// @dev Solo alcanzable vía _execute con target = address(this), que exige nivel ≥ MPC.
    ///      Para validadores, initData = abi.encode(uint8 nivel, bytes initDelMódulo); el nivel
    ///      se acota a AUTH_PASSKEY: ningún módulo puede equipararse a la llave MPC.
    function installModule(uint256 typeId, address module, bytes calldata initData) external {
        _onlySelf();
        AccountStorage storage $ = _s();
        if ($.installed[module]) revert ModuleAlreadyInstalled(module);
        if (!IModule(module).isModuleType(typeId)) revert InvalidModule(module, typeId);

        bytes memory moduleInit = initData;
        if (typeId == MODULE_TYPE_VALIDATOR) {
            (uint8 level, bytes memory init) = abi.decode(initData, (uint8, bytes));
            $.validators[module] = true;
            $.validatorLevel[module] = level > AUTH_PASSKEY ? AUTH_PASSKEY : level;
            moduleInit = init;
        } else if (typeId == MODULE_TYPE_EXECUTOR) {
            $.executors[module] = true;
        } else if (typeId == MODULE_TYPE_HOOK) {
            if ($.hook != address(0)) revert ModuleAlreadyInstalled($.hook);
            $.hook = module;
        } else {
            revert InvalidModule(module, typeId);
        }
        $.installed[module] = true;
        IModule(module).onInstall(moduleInit);
        emit ModuleInstalled(typeId, module);
    }

    function uninstallModule(uint256 typeId, address module, bytes calldata deInitData) external {
        _onlySelf();
        AccountStorage storage $ = _s();
        if (!$.installed[module]) revert ModuleNotInstalled(module);
        if (typeId == MODULE_TYPE_VALIDATOR) {
            delete $.validators[module];
            delete $.validatorLevel[module];
        } else if (typeId == MODULE_TYPE_EXECUTOR) {
            delete $.executors[module];
        } else if (typeId == MODULE_TYPE_HOOK) {
            if ($.hook != module) revert InvalidModule(module, typeId);
            delete $.hook;
        } else {
            revert InvalidModule(module, typeId);
        }
        delete $.installed[module];
        IModule(module).onUninstall(deInitData);
        emit ModuleUninstalled(typeId, module);
    }

    function isModuleInstalled(uint256 typeId, address module, bytes calldata) external view returns (bool) {
        AccountStorage storage $ = _s();
        if (typeId == MODULE_TYPE_VALIDATOR) return $.validators[module];
        if (typeId == MODULE_TYPE_EXECUTOR) return $.executors[module];
        if (typeId == MODULE_TYPE_HOOK) return $.hook == module;
        return false;
    }

    function accountId() external pure returns (string memory) {
        return "hybridwallet.account.0.1.0";
    }

    // ─────────────────────────────── ERC-1271 ───────────────────────────────

    /// @dev sig = 65 bytes → ECDSA raíz; si no, validador(20) ‖ datos.
    ///      Pendiente antes de mainnet: envolver con ERC-7739 para evitar replay entre cuentas
    ///      que compartan passkey.
    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4) {
        if (sig.length == 65) return _isRootSig(hash, sig) ? ERC1271_OK : ERC1271_FAIL;
        if (sig.length < 20) return ERC1271_FAIL;
        address validator = address(bytes20(sig[:20]));
        if (!_s().validators[validator]) return ERC1271_FAIL;
        return IValidator(validator).isValidSignatureWithSender(msg.sender, hash, sig[20:]);
    }

    // ─────────────────────────────── Internos ───────────────────────────────

    function _validate(PackedUserOperation calldata op, bytes32 opHash) internal returns (uint256) {
        address validator = _validatorOf(op.nonce);
        if (validator == address(0)) {
            return _isRootSig(opHash, op.signature) ? 0 : SIG_VALIDATION_FAILED;
        }
        if (!_s().validators[validator] || op.signature.length == 0) return SIG_VALIDATION_FAILED;

        PackedUserOperation memory inner = op;
        bytes1 kind = op.signature[0];
        if (kind == SIG_COMPOSITE) {
            (bytes memory moduleSig, bytes memory mpcSig) = abi.decode(op.signature[1:], (bytes, bytes));
            if (!_isRootSig(opHash, mpcSig)) return SIG_VALIDATION_FAILED;
            inner.signature = moduleSig;
        } else if (kind == SIG_SINGLE) {
            inner.signature = op.signature[1:];
        } else {
            return SIG_VALIDATION_FAILED;
        }
        return IValidator(validator).validateUserOp(inner, opHash);
    }

    /// @dev Determinista a partir de la UserOp ya validada por EntryPoint.
    function _authLevel(PackedUserOperation calldata op) internal view returns (uint8) {
        address validator = _validatorOf(op.nonce);
        if (validator == address(0)) return AUTH_MPC;
        if (op.signature.length != 0 && op.signature[0] == SIG_COMPOSITE) return AUTH_COMPOSITE;
        return _s().validatorLevel[validator];
    }

    function _execute(bytes32 mode, bytes memory executionCalldata, uint8 level)
        internal
        returns (bytes[] memory results)
    {
        bytes1 callType = bytes1(mode);
        Execution[] memory execs;
        if (callType == CALLTYPE_SINGLE) {
            execs = new Execution[](1);
            execs[0] = _decodeSingle(executionCalldata);
        } else if (callType == CALLTYPE_BATCH) {
            execs = abi.decode(executionCalldata, (Execution[]));
        } else {
            revert UnsupportedCallType(callType); // delegatecall prohibido
        }

        AccountStorage storage $ = _s();
        address hook = $.hook;
        results = new bytes[](execs.length);
        for (uint256 i; i < execs.length; ++i) {
            Execution memory e = execs[i];
            // Invariante 1: con passkey/session nadie toca la cuenta ni sus módulos,
            // salvo selectores que solo endurecen.
            if (level < AUTH_MPC && (e.target == address(this) || $.installed[e.target])) {
                bytes4 sel = _selector(e.callData);
                if (e.target == address(this) || !_isTightenOnly(sel)) revert AdminRequiresMpc(e.target, sel);
            }
            if (hook != address(0)) IPolicyHook(hook).checkExecution(level, e.target, e.value, e.callData);
            results[i] = _call(e.target, e.value, e.callData);
        }
    }

    function _isTightenOnly(bytes4 sel) internal pure returns (bool) {
        return sel == ITightenOnly.setLimit.selector || sel == ITightenOnly.removeAllowlist.selector
            || sel == ITightenOnly.cancelPending.selector || sel == ITightenOnly.cancel.selector
            || sel == ITightenOnly.revokeSession.selector;
    }

    function _call(address target, uint256 value, bytes memory data) internal returns (bytes memory ret) {
        bool ok;
        (ok, ret) = target.call{value: value}(data);
        if (!ok) {
            assembly ("memory-safe") {
                revert(add(ret, 0x20), mload(ret))
            }
        }
    }

    /// @dev ERC-7579 single: abi.encodePacked(target, value, callData).
    function _decodeSingle(bytes memory d) internal pure returns (Execution memory e) {
        if (d.length < 52) revert MalformedExecution();
        address target;
        uint256 value;
        uint256 len = d.length - 52;
        bytes memory cd = new bytes(len);
        assembly ("memory-safe") {
            target := shr(96, mload(add(d, 0x20)))
            value := mload(add(d, 0x34))
            mcopy(add(cd, 0x20), add(d, 0x54), len)
        }
        e = Execution(target, value, cd);
    }

    function _selector(bytes memory data) internal pure returns (bytes4 sel) {
        if (data.length < 4) return bytes4(0);
        assembly ("memory-safe") {
            sel := mload(add(data, 0x20))
        }
    }

    function _isRootSig(bytes32 hash, bytes memory sig) internal view returns (bool) {
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(hash, sig);
        return err == ECDSA.RecoverError.NoError && recovered == address(this);
    }

    function _validatorOf(uint256 nonce) internal pure returns (address) {
        return address(uint160(nonce >> 96)); // 20 bytes altos de la key de 192 bits
    }

    function _onlySelf() internal view {
        if (msg.sender != address(this)) revert OnlySelf();
    }

    function _s() private pure returns (AccountStorage storage $) {
        assembly ("memory-safe") {
            $.slot := STORAGE_SLOT
        }
    }
}
