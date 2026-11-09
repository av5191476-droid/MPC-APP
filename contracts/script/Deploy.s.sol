// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {HybridAccount} from "../src/account/HybridAccount.sol";
import {WebAuthnValidator} from "../src/validators/WebAuthnValidator.sol";
import {SpendingPolicyHook} from "../src/hooks/SpendingPolicyHook.sol";
import {GuardianRecovery} from "../src/recovery/GuardianRecovery.sol";

/// T012: CREATE2 determinista → mismas direcciones en Base, Arbitrum y Polygon.
/// forge script script/Deploy.s.sol --rpc-url $RPC --broadcast
contract Deploy is Script {
    bytes32 constant SALT = keccak256("hybridwallet.v0.1.0");
    // EntryPoint v0.8 — verificar contra el despliegue canónico antes de usar.
    address constant ENTRY_POINT_V08 = 0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108;

    function run() external {
        vm.startBroadcast();
        HybridAccount account = new HybridAccount{salt: SALT}(ENTRY_POINT_V08);
        WebAuthnValidator webauthn = new WebAuthnValidator{salt: SALT}();
        SpendingPolicyHook policy = new SpendingPolicyHook{salt: SALT}();
        GuardianRecovery recovery = new GuardianRecovery{salt: SALT}();
        vm.stopBroadcast();

        console2.log("HybridAccount     ", address(account));
        console2.log("WebAuthnValidator ", address(webauthn));
        console2.log("SpendingPolicyHook", address(policy));
        console2.log("GuardianRecovery  ", address(recovery));
    }
}
