import type { UserOperation } from '@hw/sdk';

export const fromJson = (o: Record<string, string>): UserOperation => ({
  sender: o.sender as UserOperation['sender'], nonce: BigInt(o.nonce!), initCode: o.initCode as `0x${string}`, callData: o.callData as `0x${string}`,
  callGasLimit: BigInt(o.callGasLimit!), verificationGasLimit: BigInt(o.verificationGasLimit!), preVerificationGas: BigInt(o.preVerificationGas!),
  maxFeePerGas: BigInt(o.maxFeePerGas!), maxPriorityFeePerGas: BigInt(o.maxPriorityFeePerGas!),
  paymasterAndData: o.paymasterAndData as `0x${string}`, signature: (o.signature ?? '0x') as `0x${string}`,
});
