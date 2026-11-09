import type { Hex } from 'viem';
import type { UserOperation } from '@hw/sdk';

/** Constitución V: cada proveedor detrás de una interfaz intercambiable. */
export interface BundlerClient {
  estimate(op: UserOperation, chainId: number): Promise<Pick<UserOperation, 'callGasLimit' | 'verificationGasLimit' | 'preVerificationGas'>>;
  send(op: UserOperation, chainId: number): Promise<Hex>;
  receipt(hash: Hex, chainId: number): Promise<{ status: 'pending' | 'included' | 'failed'; txHash?: Hex } | null>;
}

export interface PaymasterClient {
  sponsor(op: UserOperation, chainId: number, policyId: string): Promise<{ paymasterAndData: Hex } | { reason: 'quota' | 'policy' }>;
  erc20Quote(op: UserOperation, chainId: number, token: Hex): Promise<{ paymasterAndData: Hex; maxTokenCost: bigint }>;
}

/** El enclave solo responde a rondas MPC; nunca expone la parte S. */
export interface EnclaveSigner {
  openSession(input: { purpose: 'dkg' | 'sign' | 'reshare'; accountId: string; messageHash?: Hex; authContext: string }): Promise<{ sessionId: string; firstMessage: string }>;
  round(sessionId: string, payload: string): Promise<{ payload: string; done: boolean }>;
}
