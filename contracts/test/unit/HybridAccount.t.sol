// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {HybridAccount} from "../../src/account/HybridAccount.sol";
import {WebAuthnValidator} from "../../src/validators/WebAuthnValidator.sol";
import {SpendingPolicyHook} from "../../src/hooks/SpendingPolicyHook.sol";
import {PackedUserOperation, IAccountExecute} from "../../src/interfaces/IERC4337.sol";
import {MODULE_TYPE_VALIDATOR, MODULE_TYPE_HOOK} from "../../src/interfaces/IModules.sol";

/// T030 (invariante 1 en forma fuzz) + validación ECDSA raíz.
/// El EOA "delegado" se simula con vm.etch del runtime de la implementación.
contract HybridAccountTest is Test {
    address constant EP = address(0x4337);
    uint256 constant MPC_PK = 0xA11CE; // en producción esta llave NUNCA existe completa
    address eoa;
    HybridAccount account;
    WebAuthnValidator webauthn;
    SpendingPolicyHook hook;

    function setUp() public {
        HybridAccount impl = new HybridAccount(EP);
        eoa = vm.addr(MPC_PK);
        vm.etch(eoa, address(impl).code);
        account = HybridAccount(payable(eoa));
        webauthn = new WebAuthnValidator();
        hook = new SpendingPolicyHook();

        vm.startPrank(eoa); // ruta raíz: el EOA se llama a sí mismo
        account.installModule(
            MODULE_TYPE_VALIDATOR,
            address(webauthn),
            abi.encode(uint8(1), abi.encode(keccak256("cred-1"), WebAuthnValidator.P256Key(bytes32(uint256(1)), bytes32(uint256(2)))))
        );
        address[] memory t = new address[](0);
        account.installModule(MODULE_TYPE_HOOK, address(hook), abi.encode(t, new uint128[](0), new uint32[](0)));
        vm.stopPrank();
    }

    function _op(address validator, bytes memory sig, bytes memory single) internal view returns (PackedUserOperation memory op) {
        op.sender = eoa;
        op.nonce = uint256(uint160(validator)) << 96;
        op.callData = abi.encodePacked(IAccountExecute.executeUserOp.selector, abi.encode(bytes32(0), single));
        op.signature = sig;
    }

    function test_passkeyCannotInstallModules() public {
        bytes memory install = abi.encodeCall(HybridAccount.installModule, (1, address(0xBAD), abi.encode(uint8(1), "")));
        PackedUserOperation memory op = _op(address(webauthn), hex"00", abi.encodePacked(eoa, uint256(0), install));
        vm.prank(EP);
        vm.expectRevert(abi.encodeWithSelector(HybridAccount.AdminRequiresMpc.selector, eoa, HybridAccount.installModule.selector));
        account.executeUserOp(op, bytes32(0));
    }

    function test_passkeyCannotRelaxPolicy() public {
        bytes memory relax = abi.encodeCall(SpendingPolicyHook.proposeLimit, (address(0), 1e30, 1 days));
        PackedUserOperation memory op = _op(address(webauthn), hex"00", abi.encodePacked(address(hook), uint256(0), relax));
        vm.prank(EP);
        vm.expectRevert(abi.encodeWithSelector(HybridAccount.AdminRequiresMpc.selector, address(hook), SpendingPolicyHook.proposeLimit.selector));
        account.executeUserOp(op, bytes32(0));
    }

    function test_passkeyCanTighten() public {
        bytes memory tighten = abi.encodeCall(SpendingPolicyHook.setLimit, (address(0), 1 ether, 1 days));
        PackedUserOperation memory op = _op(address(webauthn), hex"00", abi.encodePacked(address(hook), uint256(0), tighten));
        vm.prank(EP);
        account.executeUserOp(op, bytes32(0));
        (uint128 amount,,,) = hook.limits(eoa, address(0));
        assertEq(amount, 1 ether);
    }

    function test_rootCanAdmin() public {
        bytes memory relax = abi.encodeCall(SpendingPolicyHook.proposeLimit, (address(0), 1e30, 1 days));
        PackedUserOperation memory op = _op(address(0), "", abi.encodePacked(address(hook), uint256(0), relax));
        vm.prank(EP);
        account.executeUserOp(op, bytes32(0));
    }

    /// Invariante 1: cualquier selector hacia la propia cuenta con passkey revierte.
    function testFuzz_passkeyNeverCallsSelf(bytes calldata data) public {
        PackedUserOperation memory op = _op(address(webauthn), hex"00", abi.encodePacked(eoa, uint256(0), data));
        vm.prank(EP);
        vm.expectRevert();
        account.executeUserOp(op, bytes32(0));
    }

    function test_rootSignatureValidates() public {
        bytes32 h = keccak256("userOpHash");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(MPC_PK, h);
        PackedUserOperation memory op = _op(address(0), abi.encodePacked(r, s, v), "");
        vm.prank(EP);
        assertEq(account.validateUserOp(op, h, 0), 0);
    }

    function test_foreignSignatureFails() public {
        bytes32 h = keccak256("userOpHash");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBEEF, h);
        PackedUserOperation memory op = _op(address(0), abi.encodePacked(r, s, v), "");
        vm.prank(EP);
        assertEq(account.validateUserOp(op, h, 0), 1);
    }

    function test_onlyEntryPointExecutes() public {
        PackedUserOperation memory op = _op(address(0), "", abi.encodePacked(address(1), uint256(0), ""));
        vm.expectRevert(HybridAccount.OnlyEntryPoint.selector);
        account.executeUserOp(op, bytes32(0));
    }
}
