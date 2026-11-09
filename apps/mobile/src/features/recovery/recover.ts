import { api } from '@/core/api/client';
import type { AccountDto, RecoveryRequest } from '@/core/api/types';
import { openShareB, sealShareB } from '@/core/backup/backupKey';
import { downloadEnvelope, uploadEnvelope } from '@/core/backup/cloud';
import { reshare } from '@/core/mpc/session';
import { login } from '@/core/passkey/passkey';
import { storeDeviceShare } from '@/core/secure/deviceShare';
import { keyForEnvelope } from '@/features/onboarding/uploadBackup';
import { useWallet } from '@/state/wallet';

export type RecoverStep = 'login' | 'download' | 'decrypt' | 'reshare' | 'store' | 'backup' | 'done';

/**
 * US4-AS1 / FR-017: respaldo + servidor → nuevas partes con la MISMA dirección, época + 1.
 * La parte del teléfono perdido queda inútil (épocas distintas no combinan).
 */
export async function recoverWithBackup(onStep: (s: RecoverStep) => void, password?: string) {
  onStep('login');
  const { credentialId } = await login(); // passkey sincronizada (iCloud / Google Password Manager)
  const [account] = await api<AccountDto[]>('/accounts');
  if (!account) throw new Error('No encontramos una billetera para esta llave de acceso.');

  onStep('download');
  const env = await downloadEnvelope(account.address);
  if (!env) return { needsGuardians: true as const, account };

  onStep('decrypt');
  const key = await keyForEnvelope(env, password);
  let shareB: Uint8Array;
  try { shareB = openShareB(key, env); } finally { key.fill(0); }

  onStep('reshare');
  await api<RecoveryRequest>('/recovery', { method: 'POST', auth: true, body: { method: 'reshare_backup', accountAddress: account.address } });
  const out = await reshare(account.id, shareB, env.epoch); // reshare borra shareB

  onStep('store');
  await storeDeviceShare(account.address, out.epoch, new Uint8Array(out.shareDevice));

  onStep('backup');
  const newKey = await keyForEnvelope({ ...env, kdf: env.kdf }, password);
  const newB = new Uint8Array(out.shareBackup);
  try {
    await uploadEnvelope(sealShareB(newKey, newB, account.address, out.epoch, env.salt ? Uint8Array.from(atob(env.salt), (c) => c.charCodeAt(0)) : undefined));
  } finally { newKey.fill(0); newB.fill(0); }

  useWallet.getState().setAccount({ id: account.id, address: account.address, epoch: out.epoch, webauthnValidator: account.webauthnValidator, credentialId });
  useWallet.getState().setBackup('uploaded', env.kdf);
  onStep('done');
  return { needsGuardians: false as const, account };
}

/** US4-AS3: sin respaldo, los guardianes aprueban un barrido a cuenta nueva tras 72 h (research R5). */
export const startGuardianRecovery = (accountAddress: string) =>
  api<RecoveryRequest>('/recovery', { method: 'POST', auth: false, body: { method: 'guardians', accountAddress } });

export const getRecovery = (id: string) => api<RecoveryRequest>(`/recovery/${id}`, { auth: false });
export const cancelRecovery = (id: string) => api<void>(`/recovery/${id}`, { method: 'DELETE' });
