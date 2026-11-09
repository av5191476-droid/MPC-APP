import { formatUnits, parseUnits } from 'viem';

const money = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export const USDC_DECIMALS = 6;

export const formatUsdc = (raw: bigint) => money.format(Number(formatUnits(raw, USDC_DECIMALS)));
export const formatCop = (usd: number, rate: number) => cop.format(usd * rate);
export const shortAddress = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');

/** Acepta "1.234,56" (es-CO) y "1234.56". Devuelve null si no es un monto válido. */
export function parseAmount(input: string, decimals = USDC_DECIMALS): bigint | null {
  const t = input.trim().replace(/\s/g, '');
  if (!t) return null;
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const [, frac = ''] = normalized.split('.');
  if (frac.length > decimals) return null;
  try { return parseUnits(normalized, decimals); } catch { return null; }
}

export function hoursLeft(untilMs: number, nowMs = Date.now()) {
  const ms = Math.max(0, untilMs - nowMs);
  return `${Math.floor(ms / 3_600_000)} h ${Math.floor((ms % 3_600_000) / 60_000)} min`;
}
