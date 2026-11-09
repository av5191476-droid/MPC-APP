import { openShareB, deriveBackupKey, deriveBackupKeyFromPassword, testRecoverability, fromB64, type BackupEnvelope } from '@/core/backup/backupKey';
import { uploadEnvelope, downloadEnvelope } from '@/core/backup/cloud';
import { clearPending, loadPending } from '@/core/backup/pending';
import { prfOutput } from '@/core/passkey/passkey';
import { useWallet } from '@/state/wallet';

export async function keyForEnvelope(env: BackupEnvelope, password?: string): Promise<Uint8Array> {
  if (env.kdf === 'prf-hkdf') {
    const prf = await prfOutput();
    if (!prf) throw new Error('Tu llave de acceso no pudo derivar la clave del respaldo.');
    try { return deriveBackupKey(prf); } finally { prf.fill(0); }
  }
  if (!password || !env.salt) throw new Error('Escribe tu contraseña de respaldo.');
  return deriveBackupKeyFromPassword(password, fromB64(env.salt));
}

/** US1-AS2: sube el sobre y prueba que se puede descifrar desde la nube. */
export async function uploadAndVerify(password?: string) {
  const env = await loadPending();
  if (!env) throw new Error('No hay respaldo pendiente.');
  await uploadEnvelope(env);
  const remote = await downloadEnvelope(env.account);
  if (!remote) throw new Error('El respaldo no aparece en la nube todavía. Inténtalo de nuevo.');
  const key = await keyForEnvelope(remote, password);
  try {
    if (!testRecoverability(key, remote)) throw new Error('El respaldo subido no se pudo descifrar.');
  } finally { key.fill(0); }
  await clearPending();
  useWallet.getState().setBackup('uploaded');
}

export { openShareB };
