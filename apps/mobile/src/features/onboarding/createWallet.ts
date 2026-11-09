import { bytesToHex } from 'viem';
import { api } from '@/core/api/client';
import type { AccountDto } from '@/core/api/types';
import { addressFromCompressed } from '@/core/account/address';
import { deriveBackupKey, deriveBackupKeyFromPassword, sealShareB } from '@/core/backup/backupKey';
import { savePending } from '@/core/backup/pending';
import { dkg } from '@/core/mpc/session';
import { prfOutput, register } from '@/core/passkey/passkey';
import { storeDeviceShare } from '@/core/secure/deviceShare';
import { useWallet } from '@/state/wallet';

export type CreateStep = 'passkey' | 'dkg' | 'protect' | 'seal' | 'register' | 'done';

/**
 * US1 completa: passkey → DKG 2-de-3 → D al llavero biométrico → B cifrada → registro.
 * Idempotente ante fallos (US1-AS4): nada se persiste hasta que el DKG termina; si algo falla
 * después, la cuenta no se registra y el servidor descarta la sesión (TTL 120 s).
 * `backupPassword` solo se usa si el autenticador no soporta PRF.
 */
export async function createWallet(onStep: (s: CreateStep) => void, backupPassword?: string) {
  onStep('passkey');
  const reg = await register();

  onStep('dkg');
  const out = await dkg(); // incluye verificación de attestation antes de la ronda 1
  const pk = new Uint8Array(out.publicKey);
  const address = addressFromCompressed(pk);
  const shareB = new Uint8Array(out.shareBackup);

  try {
    onStep('protect');
    await storeDeviceShare(address, out.epoch, new Uint8Array(out.shareDevice));

    onStep('seal');
    const prf = reg.prfSupported ? await prfOutput() : null;
    if (prf) {
      const key = deriveBackupKey(prf);
      await savePending(sealShareB(key, shareB, address, out.epoch));
      prf.fill(0); key.fill(0);
      useWallet.getState().setBackup('sealed', 'prf-hkdf');
    } else {
      if (!backupPassword) throw new Error('Este teléfono necesita una contraseña de respaldo.');
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = deriveBackupKeyFromPassword(backupPassword, salt);
      await savePending(sealShareB(key, shareB, address, out.epoch, salt));
      key.fill(0);
      useWallet.getState().setBackup('sealed', 'argon2id');
    }
  } finally {
    shareB.fill(0); // mpc-protocol §1.4
  }

  onStep('register');
  const account = await api<AccountDto>('/accounts', {
    method: 'POST',
    body: { mpcPublicKey: bytesToHex(pk), dkgSessionId: out.sessionId, credentialId: reg.credentialId },
  });
  if (account.address.toLowerCase() !== address.toLowerCase()) throw new Error('La dirección del servidor no coincide con la local.');

  useWallet.getState().setAccount({
    id: account.id, address, epoch: out.epoch, webauthnValidator: account.webauthnValidator, credentialId: reg.credentialId,
  });
  onStep('done');
  return address;
}
