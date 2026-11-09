import { describe, expect, it } from 'vitest';
import { deriveBackupKey, openShareB, sealShareB, testRecoverability } from '../src/core/backup/backupKey';

const ACC = '0x1111111111111111111111111111111111111111' as const;

describe('respaldo cifrado (T049)', () => {
  const key = deriveBackupKey(new Uint8Array(32).fill(9));
  it('ida y vuelta y borra el original', () => {
    const share = new Uint8Array([1, 2, 3, 4]);
    const env = sealShareB(key, share, ACC, 0);
    expect(share.every((b) => b === 0)).toBe(true);
    expect(Array.from(openShareB(key, env))).toEqual([1, 2, 3, 4]);
  });
  it('falla con otra época (AAD)', () => {
    const env = sealShareB(key, new Uint8Array([7]), ACC, 1);
    expect(() => openShareB(key, { ...env, epoch: 0 })).toThrow();
  });
  it('falla con otra llave', () => {
    const env = sealShareB(key, new Uint8Array([7]), ACC, 0);
    expect(testRecoverability(deriveBackupKey(new Uint8Array(32).fill(1)), env)).toBe(false);
  });
});
