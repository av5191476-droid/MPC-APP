import { encodeFunctionData, erc20Abi, type Address, type Hex } from 'viem';
import { compositeSignature } from '@hw/sdk';
import { api } from '@/core/api/client';
import type { PrepareResponse, UserOpStatus } from '@/core/api/types';
import { signUserOpHash } from '@/core/passkey/passkey';
import { cosign } from '@/core/mpc/session';
import { withDeviceShare } from '@/core/secure/deviceShare';
import { useWallet } from '@/state/wallet';

export type Draft = { to: Address; amount: bigint; token: Address; chainId: number };

/** FR-009: construir y simular. El servidor responde si hace falta segundo factor. */
export function prepare(d: Draft, gasMode: 'sponsored' | 'erc20' = 'sponsored') {
  const account = useWallet.getState().account!;
  return api<PrepareResponse>('/userops/prepare', {
    method: 'POST',
    body: {
      accountId: account.id, chainId: d.chainId, gasMode,
      calls: [{ to: d.token, value: '0', data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [d.to, d.amount] }) }],
    },
  });
}

export function requestStepUp(messageHash: Hex, channel: 'email' | 'sms' | 'passkey2' = 'email') {
  return api<{ challengeId: string; destination: string }>('/stepup/challenge', { method: 'POST', body: { messageHash, channel } });
}

export function verifyStepUp(challengeId: string, code: string) {
  return api<{ stepUpToken: string }>('/stepup/verify', { method: 'POST', body: { challengeId, code } });
}

export type ExecutePhase = 'passkey' | 'cosign' | 'submit';

/**
 * Firma y envía. Bajo el límite: solo passkey. Con stepUpToken: passkey + co-firma MPC
 * (firma compuesta), que es lo único que el hook acepta por encima del límite.
 */
export async function execute(prep: PrepareResponse, chainId: number, onPhase: (p: ExecutePhase) => void, stepUpToken?: string): Promise<Hex> {
  const account = useWallet.getState().account!;
  onPhase('passkey');
  const { signature, moduleSig, assertion } = await signUserOpHash(prep.userOpHash, [account.credentialId]);

  let finalSig = signature;
  if (stepUpToken) {
    onPhase('cosign');
    const mpcSig = await withDeviceShare(account.address, account.epoch, (shareDevice) =>
      cosign({ accountId: account.id, userOp: prep.userOp, messageHash: prep.userOpHash, stepUpToken, passkeyAssertion: assertion, shareDevice }),
    );
    finalSig = compositeSignature(moduleSig, mpcSig);
  }

  onPhase('submit');
  const res = await api<{ userOpHash: Hex }>('/userops/submit', { method: 'POST', body: { chainId, userOp: { ...prep.userOp, signature: finalSig } } });
  return res.userOpHash;
}

/** US2-AS4: el estado real se consulta al backend; sirve también al volver a abrir la app. */
export async function waitForStatus(hash: Hex, onUpdate: (s: UserOpStatus) => void, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const s = await api<UserOpStatus>(`/userops/${hash}`);
    onUpdate(s);
    if (s.status === 'included' || s.status === 'failed' || s.status === 'dropped') return s;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}
