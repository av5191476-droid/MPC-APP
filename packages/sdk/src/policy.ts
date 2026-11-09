import { decodeAbiParameters, type Address, type Hex } from 'viem';
import { SELECTORS } from './constants';
import type { Call } from './userop';

export type Spend = { token: Address; to: Address; amount: bigint };
const NATIVE = '0x0000000000000000000000000000000000000000' as Address;

/** Espejo off-chain de SpendingPolicyHook.checkExecution para cotizar `requiresStepUp`. */
export function spendsOf(calls: Call[], account: Address): Spend[] {
  const out: Spend[] = [];
  for (const c of calls) {
    if (c.value && c.value > 0n) out.push({ token: NATIVE, to: c.to, amount: c.value });
    const data = c.data ?? '0x';
    if (data.length < 10) continue;
    const sel = data.slice(0, 10).toLowerCase();
    const args = `0x${data.slice(10)}` as Hex;
    if (sel === SELECTORS.transfer || sel === SELECTORS.approve || sel === SELECTORS.increaseAllowance) {
      const [to, amount] = decodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], args);
      out.push({ token: c.to, to, amount });
    } else if (sel === SELECTORS.transferFrom) {
      const [from, to, amount] = decodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint256' }], args);
      if (from.toLowerCase() === account.toLowerCase()) out.push({ token: c.to, to, amount });
    }
  }
  return out;
}

export type LimitState = { amount: bigint; periodSeconds: number; spent: bigint; windowStart: number };

export function requiresStepUp(spends: Spend[], limits: Map<Address, LimitState>, now: number): boolean {
  const acc = new Map<Address, bigint>();
  for (const s of spends) {
    const l = limits.get(s.token);
    if (!l) continue;
    const base = acc.get(s.token) ?? (now >= l.windowStart + l.periodSeconds ? 0n : l.spent);
    const total = base + s.amount;
    if (total > l.amount) return true;
    acc.set(s.token, total);
  }
  return false;
}
