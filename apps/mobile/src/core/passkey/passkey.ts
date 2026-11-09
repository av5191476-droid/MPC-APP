import { Passkey } from 'react-native-passkey';
import Constants from 'expo-constants';
import { keccak256, toBytes, type Hex } from 'viem';
import { encodeWebAuthn, passkeySignature } from '@hw/sdk';
import { api, setSession } from '../api/client';
import type { Session } from '../api/types';
import { b64urlToBytes, bytesToB64url, challengeFromHash, toWebAuthnAuth } from './webauthn';

const RP_ID: string = Constants.expoConfig?.extra?.rpId;
/** Sal fija por versión para la extensión PRF: misma passkey → misma clave de respaldo. */
export const PRF_SALT_BACKUP = bytesToB64url(toBytes(keccak256(toBytes('hw-backup-salt-v1'))));

export const isSupported = () => Passkey.isSupported();

type Assertion = { id: string; response: { authenticatorData: string; clientDataJSON: string; signature: string }; clientExtensionResults?: { prf?: { results?: { first?: string } } } };

/** FR-001: crea la passkey (residente, UV requerida) y abre sesión en el backend. */
export async function register(): Promise<Session & { credentialId: string; prfSupported: boolean }> {
  const options = await api<Record<string, unknown>>('/auth/register/options', { method: 'POST', auth: false });
  const credential = await Passkey.create({
    ...(options as object),
    rp: { id: RP_ID, name: 'Billetera' },
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    extensions: { prf: {} },
  } as never);
  const session = await api<Session & { prfSupported: boolean }>('/auth/register/verify', { method: 'POST', auth: false, body: credential });
  await setSession(session);
  return { ...session, credentialId: (credential as { id: string }).id };
}

export async function login(): Promise<Session & { credentialId: string }> {
  const options = await api<Record<string, unknown>>('/auth/login/options', { method: 'POST', auth: false });
  const assertion = await Passkey.get({ ...(options as object), rpId: RP_ID, userVerification: 'required' } as never);
  const session = await api<Session>('/auth/login/verify', { method: 'POST', auth: false, body: assertion });
  await setSession(session);
  return { ...session, credentialId: (assertion as unknown as { id: string }).id };
}

/** Firma un userOpHash con la passkey. Devuelve la firma lista para HybridAccount (prefijo 0x00). */
export async function signUserOpHash(hash: Hex, allowCredentials?: string[]): Promise<{ moduleSig: Hex; signature: Hex; assertion: Assertion }> {
  const assertion = (await Passkey.get({
    rpId: RP_ID,
    challenge: challengeFromHash(hash),
    userVerification: 'required',
    allowCredentials: allowCredentials?.map((id) => ({ id, type: 'public-key' })),
  } as never)) as unknown as Assertion;
  const credIdHash = keccak256(b64urlToBytes(assertion.id));
  const moduleSig = encodeWebAuthn(credIdHash, toWebAuthnAuth(assertion.response));
  return { moduleSig, signature: passkeySignature(moduleSig), assertion };
}

/** Salida PRF (32 bytes) para derivar K_backup. Null si el autenticador no soporta PRF. */
export async function prfOutput(): Promise<Uint8Array | null> {
  const challenge = bytesToB64url(crypto.getRandomValues(new Uint8Array(32)));
  const assertion = (await Passkey.get({
    rpId: RP_ID, challenge, userVerification: 'required',
    extensions: { prf: { eval: { first: PRF_SALT_BACKUP } } },
  } as never)) as unknown as Assertion;
  const first = assertion.clientExtensionResults?.prf?.results?.first;
  return first ? b64urlToBytes(first) : null;
}
