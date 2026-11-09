// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {SpendingPolicyHook} from "../../src/hooks/SpendingPolicyHook.sol";
import {AUTH_PASSKEY, AUTH_COMPOSITE, AUTH_MPC} from "../../src/interfaces/IModules.sol";

/// T031, T073, T074. Este contrato actúa como la cuenta (msg.sender del hook).
contract SpendingPolicyHookTest is Test {
    SpendingPolicyHook hook;
    address constant USDC = address(0xA0B8);
    address constant BOB = address(0xB0B);
    uint128 constant DAILY = 200e6;

    function setUp() public {
        vm.warp(1_800_000_000);
        hook = new SpendingPolicyHook();
        address[] memory t = new address[](1);
        uint128[] memory a = new uint128[](1);
        uint32[] memory p = new uint32[](1);
        (t[0], a[0], p[0]) = (USDC, DAILY, 1 days);
        hook.onInstall(abi.encode(t, a, p));
    }

    function _transfer(uint256 amt) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(0xa9059cbb, BOB, amt);
    }

    function _exceeded(uint256 attempted) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(SpendingPolicyHook.LimitExceeded.selector, uint256(DAILY), attempted);
    }

    function test_passkeyUnderLimit_ok() public {
        hook.checkExecution(AUTH_PASSKEY, USDC, 0, _transfer(150e6));
        (,, uint128 spent,) = hook.limits(address(this), USDC);
        assertEq(spent, 150e6);
    }

    function test_passkeyOverLimit_reverts() public {
        hook.checkExecution(AUTH_PASSKEY, USDC, 0, _transfer(150e6));
        vm.expectRevert(_exceeded(250e6));
        hook.checkExecution(AUTH_PASSKEY, USDC, 0, _transfer(100e6));
    }

    function test_compositeOverLimit_ok() public {
        hook.checkExecution(AUTH_COMPOSITE, USDC, 0, _transfer(250e6));
        (,, uint128 spent,) = hook.limits(address(this), USDC);
        assertEq(spent, 250e6);
    }

    function test_windowResetsAfterPeriod() public {
        hook.checkExecution(AUTH_PASSKEY, USDC, 0, _transfer(200e6));
        vm.warp(block.timestamp + 1 days);
        hook.checkExecution(AUTH_PASSKEY, USDC, 0, _transfer(200e6));
    }

    function test_unlimitedApprove_requiresStrong() public {
        bytes memory approveMax = abi.encodeWithSelector(0x095ea7b3, BOB, type(uint256).max);
        vm.expectRevert(_exceeded(type(uint256).max));
        hook.checkExecution(AUTH_PASSKEY, USDC, 0, approveMax);
        hook.checkExecution(AUTH_MPC, USDC, 0, approveMax);
    }

    function test_transferFromOthers_notCounted() public {
        bytes memory tf = abi.encodeWithSelector(0x23b872dd, address(0xCAFE), BOB, 1_000e6);
        hook.checkExecution(AUTH_PASSKEY, USDC, 0, tf);
    }

    function test_tightenIsImmediate() public {
        hook.setLimit(USDC, 50e6, 1 days);
        vm.expectRevert(abi.encodeWithSelector(SpendingPolicyHook.LimitExceeded.selector, uint256(50e6), uint256(60e6)));
        hook.checkExecution(AUTH_PASSKEY, USDC, 0, _transfer(60e6));
    }

    function test_relaxViaSetLimit_reverts() public {
        vm.expectRevert(SpendingPolicyHook.NotATightening.selector);
        hook.setLimit(USDC, 1_000e6, 1 days);
    }

    function test_relaxNeeds48h() public {
        hook.proposeLimit(USDC, 1_000e6, 1 days);
        vm.warp(block.timestamp + 48 hours - 1);
        vm.expectRevert(
            abi.encodeWithSelector(SpendingPolicyHook.TimelockActive.selector, uint48(block.timestamp + 1))
        );
        hook.applyPending(address(this), USDC);
        vm.warp(block.timestamp + 1);
        hook.applyPending(address(this), USDC);
        hook.checkExecution(AUTH_PASSKEY, USDC, 0, _transfer(900e6));
    }

    function test_allowlistOnlyAfterTimelock() public {
        hook.addAllowlist(USDC, BOB, 1_000e6);
        vm.expectRevert(_exceeded(500e6));
        hook.checkExecution(AUTH_PASSKEY, USDC, 0, _transfer(500e6));
        vm.warp(block.timestamp + 48 hours);
        hook.checkExecution(AUTH_PASSKEY, USDC, 0, _transfer(500e6));
    }

    /// Invariante 2 (forma fuzz): con passkey sola, `spent` nunca supera el límite.
    function testFuzz_passkeyNeverExceeds(uint96 a, uint96 b, uint96 c) public {
        uint96[3] memory xs = [a, b, c];
        for (uint256 i; i < 3; ++i) {
            try hook.checkExecution(AUTH_PASSKEY, USDC, 0, _transfer(xs[i])) {} catch {}
            (uint128 cap,, uint128 spent,) = hook.limits(address(this), USDC);
            assertLe(spent, cap);
        }
    }
}
