// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {WebAuthn} from "@openzeppelin/contracts/utils/cryptography/WebAuthn.sol";
import {PackedUserOperation} from "../interfaces/IERC4337.sol";
import {IValidator, MODULE_TYPE_VALIDATOR} from "../interfaces/IModules.sol";

/// @title WebAuthnValidator (FR-007a)
/// @notice Valida UserOps firmadas por una llave de acceso (P-256).
///         OZ WebAuthn verifica: challenge = base64url(userOpHash), tipo "webauthn.get",
///         flags UP y UV, y `s` en la mitad baja. OZ P256 usa el precompile 0x100
///         (RIP-7212 / EIP-7951) y cae a Solidity si no existe.
/// @dev firma = abi.encode(bytes32 credIdHash, WebAuthn.WebAuthnAuth)
contract WebAuthnValidator is IValidator {
    struct P256Key {
        bytes32 x;
        bytes32 y;
    }

    bytes4 internal constant ERC1271_OK = 0x1626ba7e;
    bytes4 internal constant ERC1271_FAIL = 0xffffffff;

    /// @dev `generation` permite desinstalar sin iterar el mapping.
    mapping(address account => uint256) public generation;
    mapping(address account => mapping(uint256 gen => mapping(bytes32 credIdHash => P256Key))) internal _keys;
    mapping(address account => uint256) public credentialCount;

    event CredentialAdded(address indexed account, bytes32 indexed credIdHash, bytes32 x, bytes32 y);
    event CredentialRemoved(address indexed account, bytes32 indexed credIdHash);

    error InvalidKey();
    error UnknownCredential(bytes32 credIdHash);
    error CredentialExists(bytes32 credIdHash);
    error LastCredential();

    function onInstall(bytes calldata data) external {
        (bytes32 credIdHash, P256Key memory key) = abi.decode(data, (bytes32, P256Key));
        _add(msg.sender, credIdHash, key);
    }

    function onUninstall(bytes calldata) external {
        unchecked {
            ++generation[msg.sender];
        }
        credentialCount[msg.sender] = 0;
    }

    function isModuleType(uint256 typeId) external pure returns (bool) {
        return typeId == MODULE_TYPE_VALIDATOR;
    }

    /// @notice msg.sender = cuenta. La cuenta solo permite esta llamada con nivel MPC.
    function addCredential(bytes32 credIdHash, P256Key calldata key) external {
        _add(msg.sender, credIdHash, key);
    }

    function removeCredential(bytes32 credIdHash) external {
        uint256 gen = generation[msg.sender];
        if (_keys[msg.sender][gen][credIdHash].x == 0) revert UnknownCredential(credIdHash);
        if (credentialCount[msg.sender] == 1) revert LastCredential();
        delete _keys[msg.sender][gen][credIdHash];
        --credentialCount[msg.sender];
        emit CredentialRemoved(msg.sender, credIdHash);
    }

    function credential(address account, bytes32 credIdHash) external view returns (P256Key memory) {
        return _keys[account][generation[account]][credIdHash];
    }

    function validateUserOp(PackedUserOperation calldata op, bytes32 opHash) external view returns (uint256) {
        return _verify(op.sender, opHash, op.signature) ? 0 : 1;
    }

    function isValidSignatureWithSender(address, bytes32 hash, bytes calldata data)
        external
        view
        returns (bytes4)
    {
        return _verify(msg.sender, hash, data) ? ERC1271_OK : ERC1271_FAIL;
    }

    function _verify(address account, bytes32 hash, bytes memory sig) internal view returns (bool) {
        (bytes32 credIdHash, WebAuthn.WebAuthnAuth memory auth) = abi.decode(sig, (bytes32, WebAuthn.WebAuthnAuth));
        P256Key memory key = _keys[account][generation[account]][credIdHash];
        if (key.x == 0 && key.y == 0) return false;
        return WebAuthn.verify(abi.encodePacked(hash), auth, key.x, key.y, true /* requireUV */ );
    }

    function _add(address account, bytes32 credIdHash, P256Key memory key) internal {
        if (key.x == 0 || key.y == 0) revert InvalidKey();
        uint256 gen = generation[account];
        if (_keys[account][gen][credIdHash].x != 0) revert CredentialExists(credIdHash);
        _keys[account][gen][credIdHash] = key;
        ++credentialCount[account];
        emit CredentialAdded(account, credIdHash, key.x, key.y);
    }
}
