import { create } from 'zustand';
import type { Address } from 'viem';
import type { PrepareResponse, UserOpStatus } from '@/core/api/types';

/** Estado efímero del flujo Enviar (no se persiste). */
type SendState = {
  to: string; amountText: string; chainId: number; token: Address | null;
  prep: PrepareResponse | null; stepUpToken: string | null; challenge: { id: string; destination: string } | null;
  status: UserOpStatus | null; error: string | null;
  set(p: Partial<Omit<SendState, 'set' | 'reset'>>): void;
  reset(): void;
};

const initial = { to: '', amountText: '', chainId: 84532, token: null, prep: null, stepUpToken: null, challenge: null, status: null, error: null };
export const useSend = create<SendState>()((set) => ({ ...initial, set: (p) => set(p), reset: () => set(initial) }));
