import {
  concat, encodeAbiParameters, hashTypedData, keccak256, pad, toFunctionSelector, toHex,
  type Address, type Hex,
} from 'viem';
import { MODE } from './constants';

export type Call = { to: Address; value?: bigint; data?: Hex };

export type UserOperation = {
  sender: Address;
  nonce: bigint;
  initCode: Hex; // con 7702 se usa el marcador 0x7702 (ver EntryPoint v0.8)
  callData: Hex;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterAndData: Hex;
  signature: Hex;
};

const EXECUTE_USER_OP = toFunctionSelector(
  'executeUserOp((address,uint256,bytes,bytes,bytes32,uint256,bytes32,bytes,bytes),bytes32)',
);

/** Nonce ERC-7579: los 20 bytes altos de la key de 192 bits eligen el validador. */
export function encodeNonce(validator: Address | null, sequence: bigint): bigint {
  if (sequence >= 1n << 64n) throw new Error('sequence fuera de rango');
  const v = validator ? BigInt(validator) : 0n;
  return (v << 96n) | sequence;
}

export function validatorOf(nonce: bigint): Address {
  return pad(toHex(nonce >> 96n), { size: 20 }) as Address;
}

export function encodeSingle(c: Call): Hex {
  return concat([c.to, pad(toHex(c.value ?? 0n), { size: 32 }), c.data ?? '0x']);
}

export function encodeBatch(calls: Call[]): Hex {
  return encodeAbiParameters(
    [{ type: 'tuple[]', components: [{ type: 'address' }, { type: 'uint256' }, { type: 'bytes' }] }],
    [calls.map((c) => [c.to, c.value ?? 0n, c.data ?? '0x'] as const)],
  );
}

/** callData que hace que EntryPoint entregue la UserOp completa a executeUserOp. */
export function encodeCallData(calls: Call[]): Hex {
  const [mode, exec] = calls.length === 1 ? [MODE.SINGLE, encodeSingle(calls[0]!)] : [MODE.BATCH, encodeBatch(calls)];
  return concat([EXECUTE_USER_OP, encodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes' }], [mode as Hex, exec])]);
}

const pack128 = (hi: bigint, lo: bigint): Hex => concat([pad(toHex(hi), { size: 16 }), pad(toHex(lo), { size: 16 })]);

export function pack(op: UserOperation) {
  return {
    sender: op.sender,
    nonce: op.nonce,
    initCode: op.initCode,
    callData: op.callData,
    accountGasLimits: pack128(op.verificationGasLimit, op.callGasLimit),
    preVerificationGas: op.preVerificationGas,
    gasFees: pack128(op.maxPriorityFeePerGas, op.maxFeePerGas),
    paymasterAndData: op.paymasterAndData,
  };
}

/** userOpHash de EntryPoint v0.8 (EIP-712). Verificar contra getUserOpHash on-chain en fork tests (T037). */
export function getUserOpHash(op: UserOperation, entryPoint: Address, chainId: number): Hex {
  return hashTypedData({
    domain: { name: 'ERC4337', version: '1', chainId, verifyingContract: entryPoint },
    types: {
      PackedUserOperation: [
        { name: 'sender', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'initCode', type: 'bytes' },
        { name: 'callData', type: 'bytes' },
        { name: 'accountGasLimits', type: 'bytes32' },
        { name: 'preVerificationGas', type: 'uint256' },
        { name: 'gasFees', type: 'bytes32' },
        { name: 'paymasterAndData', type: 'bytes' },
      ],
    },
    primaryType: 'PackedUserOperation',
    message: pack(op),
  });
}

export const hashCalls = (calls: Call[]) => keccak256(encodeCallData(calls));
