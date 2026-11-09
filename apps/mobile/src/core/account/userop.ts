import type { UserOperation } from '@hw/sdk';
import type { UserOpJson } from '../api/types';

export const fromJson = (o: UserOpJson): UserOperation => ({
  ...o,
  nonce: BigInt(o.nonce), callGasLimit: BigInt(o.callGasLimit), verificationGasLimit: BigInt(o.verificationGasLimit),
  preVerificationGas: BigInt(o.preVerificationGas), maxFeePerGas: BigInt(o.maxFeePerGas), maxPriorityFeePerGas: BigInt(o.maxPriorityFeePerGas),
});

export const toJson = (o: UserOperation): UserOpJson => ({
  ...o,
  nonce: o.nonce.toString(), callGasLimit: o.callGasLimit.toString(), verificationGasLimit: o.verificationGasLimit.toString(),
  preVerificationGas: o.preVerificationGas.toString(), maxFeePerGas: o.maxFeePerGas.toString(), maxPriorityFeePerGas: o.maxPriorityFeePerGas.toString(),
});
