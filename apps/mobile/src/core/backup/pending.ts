import * as SecureStore from 'expo-secure-store';
import type { BackupEnvelope } from './backupKey';

/**
 * Tras el DKG, share_B se cifra de inmediato y el SOBRE (no la parte) espera aquí hasta que
 * el usuario lo sube. Así nunca hay share_B en claro fuera de la memoria del DKG.
 */
const KEY = 'hw.pendingBackup';
export const savePending = (e: BackupEnvelope) => SecureStore.setItemAsync(KEY, JSON.stringify(e), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
export const loadPending = async () => { const v = await SecureStore.getItemAsync(KEY); return v ? (JSON.parse(v) as BackupEnvelope) : null; };
export const clearPending = () => SecureStore.deleteItemAsync(KEY);
