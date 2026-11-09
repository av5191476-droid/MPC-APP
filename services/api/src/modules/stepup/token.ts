import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Hex } from 'viem';

/** stepUpToken (FR-014): 5 min, de un solo uso y ligado a UN messageHash. */
export type StepUpClaims = { sub: string; hash: Hex; factor: 'otp_email' | 'otp_sms' | 'passkey2'; exp: number; jti: string };

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function issueStepUp(secret: Buffer, c: Omit<StepUpClaims, 'exp' | 'jti'>, now = Date.now()): string {
  const claims: StepUpClaims = { ...c, exp: Math.floor(now / 1000) + 300, jti: randomUUID() };
  const body = b64(JSON.stringify(claims));
  return `${body}.${b64(createHmac('sha256', secret).update(body).digest())}`;
}

export function readStepUp(secret: Buffer, token: string): StepUpClaims | null {
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()) as StepUpClaims; } catch { return null; }
}
