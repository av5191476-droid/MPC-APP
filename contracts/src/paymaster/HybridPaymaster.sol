// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IPaymaster, IStakeManagerLite, PackedUserOperation} from "../interfaces/IERC4337.sol";

/// @title HybridPaymaster — modo verifying (FR-010)
/// @notice El backend firma (hash de la UserOp, validUntil, validAfter) cuando la política de
///         patrocinio lo permite. paymasterAndData =
///         paymaster(20) ‖ verifGas(16) ‖ postOpGas(16) ‖ validUntil(6) ‖ validAfter(6) ‖ firma
/// @dev El modo ERC-20 (cobro en USDC en postOp con oráculo) queda para T063b.
contract HybridPaymaster is IPaymaster {
    using ECDSA for bytes32;

    address public immutable ENTRY_POINT;
    address public owner;
    address public signer;

    uint256 private constant PM_DATA_OFFSET = 52;
    uint256 private constant SIG_OFFSET = 64;

    error OnlyEntryPoint();
    error OnlyOwner();
    error MalformedPaymasterData();

    event SignerRotated(address indexed previous, address indexed next);

    constructor(address entryPoint, address owner_, address signer_) {
        ENTRY_POINT = entryPoint;
        owner = owner_;
        signer = signer_;
    }

    function getHash(PackedUserOperation calldata op, uint48 validUntil, uint48 validAfter)
        public
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                op.sender,
                op.nonce,
                keccak256(op.initCode),
                keccak256(op.callData),
                op.accountGasLimits,
                uint256(bytes32(op.paymasterAndData[20:PM_DATA_OFFSET])),
                op.preVerificationGas,
                op.gasFees,
                block.chainid,
                address(this),
                validUntil,
                validAfter
            )
        );
    }

    function validatePaymasterUserOp(PackedUserOperation calldata op, bytes32, uint256)
        external
        view
        returns (bytes memory context, uint256 validationData)
    {
        if (msg.sender != ENTRY_POINT) revert OnlyEntryPoint();
        bytes calldata pnd = op.paymasterAndData;
        if (pnd.length < SIG_OFFSET + 64) revert MalformedPaymasterData();
        uint48 validUntil = uint48(bytes6(pnd[PM_DATA_OFFSET:PM_DATA_OFFSET + 6]));
        uint48 validAfter = uint48(bytes6(pnd[PM_DATA_OFFSET + 6:SIG_OFFSET]));

        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(getHash(op, validUntil, validAfter));
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, pnd[SIG_OFFSET:]);
        uint256 sigFailed = (err != ECDSA.RecoverError.NoError || recovered != signer) ? 1 : 0;

        context = "";
        validationData = sigFailed | (uint256(validUntil) << 160) | (uint256(validAfter) << 208);
    }

    function postOp(PostOpMode, bytes calldata, uint256, uint256) external view {
        if (msg.sender != ENTRY_POINT) revert OnlyEntryPoint();
    }

    function rotateSigner(address next) external {
        if (msg.sender != owner) revert OnlyOwner();
        emit SignerRotated(signer, next);
        signer = next;
    }

    function deposit() external payable {
        IStakeManagerLite(ENTRY_POINT).depositTo{value: msg.value}(address(this));
    }

    function withdrawTo(address payable to, uint256 amount) external {
        if (msg.sender != owner) revert OnlyOwner();
        IStakeManagerLite(ENTRY_POINT).withdrawTo(to, amount);
    }
}
