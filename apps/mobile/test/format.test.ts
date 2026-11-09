import { describe, expect, it, vi } from 'vitest';
vi.mock('expo-secure-store', () => ({}));
import { parseAmount, formatUsdc } from '../src/core/format';
import { validateRecipient } from '../src/core/account/validation';
import { shouldRemindBackup } from '../src/state/wallet';

const SELF = '0x1111111111111111111111111111111111111111';
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

describe('parseAmount', () => {
  it('entiende formato es-CO y punto decimal', () => {
    expect(parseAmount('1.234,56')).toBe(1_234_560_000n);
    expect(parseAmount('5.5')).toBe(5_500_000n);
    expect(parseAmount('5,5')).toBe(5_500_000n);
  });
  it('rechaza basura y más de 6 decimales', () => {
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('1,1234567')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });
  it('formatea en es-CO', () => {
    expect(formatUsdc(250_000_000n)).toBe('250,00');
  });
});

describe('validateRecipient (US2-AS3)', () => {
  it('formato', () => expect(validateRecipient('0x123', SELF, [USDC])).toBe('address'));
  it('contrato del token', () => expect(validateRecipient(USDC, SELF, [USDC])).toBe('tokenContract'));
  it('propia cuenta', () => expect(validateRecipient(SELF, SELF, [USDC])).toBe('self'));
  it('válida', () => expect(validateRecipient('0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', SELF, [USDC])).toBeNull());
});

describe('recordatorio de respaldo (US1-AS3)', () => {
  const now = 1_800_000_000_000;
  it('no recuerda antes de 24 h con poco saldo', () => expect(shouldRemindBackup({ backup: 'sealed', createdAt: now - 3_600_000 }, 50, now)).toBe(false));
  it('recuerda pasadas 24 h', () => expect(shouldRemindBackup({ backup: 'sealed', createdAt: now - 25 * 3_600_000 }, 0, now)).toBe(true));
  it('recuerda sobre USD 100', () => expect(shouldRemindBackup({ backup: 'none', createdAt: now }, 150, now)).toBe(true));
  it('nunca si ya está subido', () => expect(shouldRemindBackup({ backup: 'uploaded', createdAt: 0 }, 1e6, now)).toBe(false));
});
