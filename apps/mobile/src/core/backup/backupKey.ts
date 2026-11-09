import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { utf8ToBytes } from '@noble/hashes/utils';
import { argon2id } from '@noble/hashes/argon2';

/**
 * FR-004 / mpc-protocol §1.3: K_backup = HKDF(PRF(passkey, salt_backup), "hw-backup-v1").
 * La nube del usuario solo ve el sobre cifrado. Librerías auditadas (@noble), nada casero.
 */
export const BACKUP_INFO = 'hw-backup-v1';
export const ENVELOPE_VERSION = 1;

export type BackupEnvelope = {
  v: typeof ENVELOPE_VERSION;
  account: `0x${string}`;
  epoch: number;
  kdf: 'prf-hkdf' | 'argon2id';
  salt?: string; // base64, solo argon2id
  nonce: string; // base64
  ct: string; // base64 (incluye tag GCM)
};

export function deriveBackupKey(prfOutput: Uint8Array): Uint8Array {
  if (prfOutput.length !== 32) throw new Error('PRF debe devolver 32 bytes');
  return hkdf(sha256, prfOutput, undefined, utf8ToBytes(BACKUP_INFO), 32);
}

/**
 * Respaldo sin PRF: contraseña + Argon2id. Parámetros OWASP mínimos (19 MiB, t=2) porque
 * corre en JS dentro de Hermes; mover a nativo si se quiere subir la memoria.
 */
export const ARGON2_PARAMS = { m: 19_456, t: 2, p: 1, dkLen: 32 } as const;
export function deriveBackupKeyFromPassword(password: string, salt: Uint8Array): Uint8Array {
  if (password.length < 10) throw new Error('La contraseña de respaldo debe tener al menos 10 caracteres.');
  return argon2id(utf8ToBytes(password.normalize('NFKC')), salt, ARGON2_PARAMS);
}

/** AAD ata el sobre a la cuenta y a la época: no se puede reusar en otra cuenta ni restaurar uno viejo sin notarlo. */
const aad = (account: string, epoch: number) => utf8ToBytes(`${BACKUP_INFO}|${account.toLowerCase()}|${epoch}`);

export function sealShareB(key: Uint8Array, shareB: Uint8Array, account: `0x${string}`, epoch: number, salt?: Uint8Array): BackupEnvelope {
  const nonce = randomBytes(12);
  const ct = gcm(key, nonce, aad(account, epoch)).encrypt(shareB);
  shareB.fill(0); // zeroize del original (mpc-protocol §1.4)
  return { v: ENVELOPE_VERSION, account, epoch, kdf: salt ? 'argon2id' : 'prf-hkdf', ...(salt ? { salt: toB64(salt) } : {}), nonce: toB64(nonce), ct: toB64(ct) };
}

/** Lanza si la llave, la cuenta o la época no coinciden (tag GCM). El llamador debe borrar el resultado tras usarlo. */
export function openShareB(key: Uint8Array, env: BackupEnvelope): Uint8Array {
  return gcm(key, fromB64(env.nonce), aad(env.account, env.epoch)).decrypt(fromB64(env.ct));
}

/** "Probar respaldo" (US1-AS2): descifra y descarta sin persistir. */
export function testRecoverability(key: Uint8Array, env: BackupEnvelope): boolean {
  try { const s = openShareB(key, env); s.fill(0); return true; } catch { return false; }
}

export const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
export const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
