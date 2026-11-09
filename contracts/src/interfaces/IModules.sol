// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PackedUserOperation} from "./IERC4337.sol";

uint256 constant MODULE_TYPE_VALIDATOR = 1;
uint256 constant MODULE_TYPE_EXECUTOR = 2;
uint256 constant MODULE_TYPE_HOOK = 4;

/// @dev Nivel de autorización con el que se validó una operación. Mayor = más fuerte.
uint8 constant AUTH_SESSION = 0; // session key acotada
uint8 constant AUTH_PASSKEY = 1; // llave de acceso sola (uso diario)
uint8 constant AUTH_MPC = 2; // ECDSA raíz del EOA (dispositivo + servidor, o dispositivo + respaldo)
uint8 constant AUTH_COMPOSITE = 3; // passkey + MPC
uint8 constant AUTH_RECOVERY = 4; // executor de recuperación tras timelock

interface IModule {
    function onInstall(bytes calldata data) external;
    function onUninstall(bytes calldata data) external;
    function isModuleType(uint256 typeId) external view returns (bool);
}

interface IValidator is IModule {
    function validateUserOp(PackedUserOperation calldata userOp, bytes32 userOpHash) external returns (uint256);
    function isValidSignatureWithSender(address sender, bytes32 hash, bytes calldata data)
        external
        view
        returns (bytes4);
}

/// @dev Variante del hook ERC-7579 que recibe el nivel de autorización: un preCheck estándar
///      no puede saber qué firmantes validaron la operación.
interface IPolicyHook is IModule {
    function checkExecution(uint8 authLevel, address target, uint256 value, bytes calldata data) external;
}

interface IExecutorHost {
    function executeFromExecutor(bytes32 mode, bytes calldata executionCalldata)
        external
        payable
        returns (bytes[] memory);
}

/// @dev Selectores que un módulo GARANTIZA que solo endurecen la seguridad. La cuenta los
///      permite con passkey sola ("endurecer es inmediato", FR-015). Todo módulo que exponga
///      uno de estos selectores debe respetar ese contrato; se verifica en auditoría.
interface ITightenOnly {
    function setLimit(address token, uint128 amount, uint32 period) external; // revierte si relaja
    function removeAllowlist(address token, address to) external;
    function cancelPending(address token) external;
    function cancel() external; // cancela una recuperación en curso
    function revokeSession(address sessionKey) external; // revocar session key de una dApp
}
