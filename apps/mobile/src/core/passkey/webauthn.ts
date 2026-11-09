import { bytesToHex, hexToBytes, type Hex } from 'viem';
import type { WebAuthnAuth } from '@hw/sdk';

/** Utilidades puras (probadas en test/webauthn.test.ts). */
export const b64urlToBytes = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};
export const bytesToB64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** El challenge de la passkey es el userOpHash (32 bytes) en base64url. */
export const challengeFromHash = (hash: Hex) => bytesToB64url(hexToBytes(hash));

/** Firma ECDSA DER → (r, s) de 32 bytes. */
export function derToRS(der: Uint8Array): { r: Hex; s: Hex } {
  if (der[0] !== 0x30) throw new Error('firma DER inválida');
  let i = 2;
  const readInt = () => {
    if (der[i] !== 0x02) throw new Error('entero DER inválido');
    const len = der[i + 1]!;
    let v = der.slice(i + 2, i + 2 + len);
    i += 2 + len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return bytesToHex(out);
  };
  return { r: readInt(), s: readInt() };
}

/** Índices que OZ WebAuthn usa para comprobar challenge y tipo dentro de clientDataJSON. */
export function toWebAuthnAuth(a: { authenticatorData: string; clientDataJSON: string; signature: string }): WebAuthnAuth {
  const clientDataJSON = new TextDecoder().decode(b64urlToBytes(a.clientDataJSON));
  const challengeIndex = clientDataJSON.indexOf('"challenge":"');
  const typeIndex = clientDataJSON.indexOf('"type":"');
  if (challengeIndex < 0 || typeIndex < 0) throw new Error('clientDataJSON sin challenge o type');
  const { r, s } = derToRS(b64urlToBytes(a.signature));
  return {
    r, s,
    challengeIndex: BigInt(challengeIndex),
    typeIndex: BigInt(typeIndex),
    authenticatorData: bytesToHex(b64urlToBytes(a.authenticatorData)),
    clientDataJSON,
  };
}

/** Flags del authenticatorData (byte 32): UP=0x01, UV=0x04, BE=0x08, BS=0x10. */
export function readFlags(authenticatorData: Hex) {
  const f = hexToBytes(authenticatorData)[32] ?? 0;
  return { userPresent: !!(f & 0x01), userVerified: !!(f & 0x04), backupEligible: !!(f & 0x08), backedUp: !!(f & 0x10) };
}
