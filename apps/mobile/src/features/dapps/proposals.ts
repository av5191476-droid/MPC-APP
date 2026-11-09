import { create } from 'zustand';
import type { WalletKitTypes } from '@reown/walletkit';

/** La propuesta de WalletConnect pendiente de revisar (llega por evento session_proposal). */
const store = create<{ proposal: WalletKitTypes.SessionProposal | null; set(p: WalletKitTypes.SessionProposal | null): void }>()((set) => ({
  proposal: null, set: (proposal) => set({ proposal }),
}));
export const usePendingProposal = () => store((s) => s.proposal);
export const setPendingProposal = (p: WalletKitTypes.SessionProposal | null) => store.getState().set(p);
