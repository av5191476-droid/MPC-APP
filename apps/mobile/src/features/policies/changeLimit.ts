import type { Hex } from 'viem';
import { compositeSignature } from '@hw/sdk';
import { api } from '@/core/api/client';
import type { PrepareResponse } from '@/core/api/types';
import { signUserOpHash } from '@/core/passkey/passkey';
import { cosign } from '@/core/mpc/session';
import { withDeviceShare } from '@/core/secure/deviceShare';
import { useWallet } from '@/state/wallet';

type PolicyPrep = PrepareResponse & { kind: 'tighten' | 'relax' };

/**
 * FR-015. Bajar: setLimit firmado solo con passkey (selector que solo endurece), inmediato.
 * Subir: proposeLimit exige firma MPC + segundo factor y entra en vigor tras 48 h.
 */
export async function prepareLimitChange(chainId: number, token: Hex, limitAmount: bigint) {
  const account = useWallet.getState().account!;
  return api<PolicyPrep>(`/policies/${account.id}`, { method: 'PUT', body: { chainId, token, limitAmount: limitAmount.toString(), periodSeconds: 86_400 } });
}

export async function submitLimitChange(prep: PolicyPrep, chainId: number, stepUpToken?: string) {
  const account = useWallet.getState().account!;
  const { signature, moduleSig, assertion } = await signUserOpHash(prep.userOpHash, [account.credentialId]);
  let sig = signature;
  if (prep.kind === 'relax') {
    if (!stepUpToken) throw new Error('Subir el límite necesita un código de verificación.');
    const mpc = await withDeviceShare(account.address, account.epoch, (shareDevice) =>
      cosign({ accountId: account.id, userOp: prep.userOp, messageHash: prep.userOpHash, stepUpToken, passkeyAssertion: assertion, shareDevice }),
    );
    sig = compositeSignature(moduleSig, mpc);
  }
  return api<{ userOpHash: Hex }>('/userops/submit', { method: 'POST', body: { chainId, userOp: { ...prep.userOp, signature: sig } } });
}

export const cancelPendingChange = (chainId: number, token: Hex) =>
  api<PrepareResponse>(`/policies/${useWallet.getState().account!.id}/pending`, { method: 'DELETE', body: { chainId, token } });
