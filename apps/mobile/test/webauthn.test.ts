import { describe, expect, it } from 'vitest';
import { derToRS, readFlags, b64urlToBytes, bytesToB64url, challengeFromHash } from '../src/core/passkey/webauthn';

describe('derToRS', () => {
  it('quita el byte 0x00 de signo y rellena a 32 bytes', () => {
    const r = new Uint8Array(33); r[0] = 0; r[1] = 0x80; r[32] = 1;
    const s = new Uint8Array(31).fill(2);
    const der = new Uint8Array([0x30, 2 + 33 + 2 + 31, 0x02, 33, ...r, 0x02, 31, ...s]);
    const out = derToRS(der);
    expect(out.r.length).toBe(66);
    expect(out.r.startsWith('0x80')).toBe(true);
    expect(out.s.startsWith('0x00')).toBe(true);
  });
  it('rechaza lo que no es DER', () => {
    expect(() => derToRS(new Uint8Array([1, 2, 3]))).toThrow();
  });
});

describe('base64url', () => {
  it('ida y vuelta', () => {
    const b = crypto.getRandomValues(new Uint8Array(37));
    expect(b64urlToBytes(bytesToB64url(b))).toEqual(b);
  });
  it('el challenge es el hash en base64url sin relleno', () => {
    expect(challengeFromHash(`0x${'ff'.repeat(32)}`)).not.toContain('=');
  });
});

describe('flags', () => {
  it('lee UP, UV y BS', () => {
    const ad = `0x${'00'.repeat(32)}15${'00'.repeat(4)}` as const; // 0x15 = UP | UV | BS
    expect(readFlags(ad)).toEqual({ userPresent: true, userVerified: true, backupEligible: false, backedUp: true });
  });
});
