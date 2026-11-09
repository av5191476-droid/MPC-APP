import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import type { Address } from 'viem';

/** Estado local NO sensible. Nada de partes, tokens ni salidas PRF aquí. */
export type Account = { id: string; address: Address; epoch: number; webauthnValidator: Address; credentialId: string };
export type BackupState = 'none' | 'sealed' | 'uploaded';

type WalletState = {
  account: Account | null;
  backup: BackupState;
  backupKdf: 'prf-hkdf' | 'argon2id' | null;
  createdAt: number | null;
  setAccount(a: Account): void;
  setEpoch(e: number): void;
  setBackup(b: BackupState, kdf?: 'prf-hkdf' | 'argon2id'): void;
  reset(): void;
};

const secureStorage = {
  getItem: (k: string) => SecureStore.getItemAsync(k),
  setItem: (k: string, v: string) => SecureStore.setItemAsync(k, v),
  removeItem: (k: string) => SecureStore.deleteItemAsync(k),
};

export const useWallet = create<WalletState>()(
  persist(
    (set) => ({
      account: null,
      backup: 'none',
      backupKdf: null,
      createdAt: null,
      setAccount: (account) => set({ account, createdAt: Date.now() }),
      setEpoch: (epoch) => set((s) => (s.account ? { account: { ...s.account, epoch } } : s)),
      setBackup: (backup, kdf) => set((s) => ({ backup, backupKdf: kdf ?? s.backupKdf })),
      reset: () => set({ account: null, backup: 'none', backupKdf: null, createdAt: null }),
    }),
    { name: 'hw.wallet', storage: createJSONStorage(() => secureStorage) },
  ),
);

/** US1-AS3: recordar respaldo tras 24 h o al pasar de USD 100 recibidos. */
export function shouldRemindBackup(s: Pick<WalletState, 'backup' | 'createdAt'>, balanceUsd: number, now = Date.now()) {
  if (s.backup === 'uploaded') return false;
  return balanceUsd > 100 || (s.createdAt !== null && now - s.createdAt > 24 * 3_600_000);
}
