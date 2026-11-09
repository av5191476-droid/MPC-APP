import type { Hex, Address } from 'viem';

export type Session = { accessToken: string; refreshToken: string; userId: string };
export type AccountDto = { id: string; address: Address; webauthnValidator: Address; epoch: number; chains: { chainId: number; status: 'pending' | 'active' }[] };

/** UserOperation tal como viaja por JSON: bigints como string decimal. */
export type UserOpJson = {
  sender: Address; nonce: string; initCode: Hex; callData: Hex;
  callGasLimit: string; verificationGasLimit: string; preVerificationGas: string;
  maxFeePerGas: string; maxPriorityFeePerGas: string; paymasterAndData: Hex; signature: Hex;
};

export type PrepareResponse = {
  userOp: UserOpJson; userOpHash: Hex;
  fee: { token: string; amount: string; sponsored: boolean; fiatEstimate?: string };
  requiresStepUp: boolean;
  simulation?: { token: Address; delta: string }[];
};

export type UserOpStatus = { userOpHash: Hex; status: 'built' | 'signed' | 'submitted' | 'included' | 'failed' | 'dropped'; txHash?: Hex; revertReason?: string; blockNumber?: number };
export type Policy = { chainId: number; token: Address; periodSeconds: number; limitAmount: string; spent: string; windowStart: number; pendingChange: { limitAmount: string; effectiveAt: number } | null };
export type ActivityItem = { id: string; kind: 'in' | 'out' | 'rejected' | 'dapp' | 'admin'; amount: string; token: string; counterparty?: Address; chainId: number; at: number };
export type Balances = { chainId: number; token: 'USDC' | 'USDT' | 'ETH' | 'POL'; amount: string; decimals: number }[];
export type RecoveryRequest = { id: string; method: 'reshare_backup' | 'guardians' | 'sweep'; status: 'initiated' | 'verifying' | 'timelocked' | 'executed' | 'cancelled' | 'failed'; timelockEndsAt?: number; newAddress?: Address };
