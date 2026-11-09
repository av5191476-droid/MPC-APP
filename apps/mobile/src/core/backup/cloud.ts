import { Platform } from 'react-native';
import { CloudStorage, CloudStorageProvider, CloudStorageScope } from 'react-native-cloud-storage';
import type { BackupEnvelope } from './backupKey';

/**
 * T050/T051: el sobre cifrado vive en la nube del usuario.
 * iOS: contenedor iCloud de la app. Android: Google Drive appDataFolder (oculto al usuario,
 * solo accesible por esta app). En Android hace falta un accessToken de Google Sign-In con
 * el scope drive.appdata; se configura con setGoogleAccessToken.
 */
const path = (account: string) => `/hw-backup-${account.toLowerCase()}.json`;

export const cloudName = Platform.OS === 'ios' ? 'iCloud' : 'Google Drive';

const storage = new CloudStorage(Platform.OS === 'ios' ? CloudStorageProvider.ICloud : CloudStorageProvider.GoogleDrive);

export function setGoogleAccessToken(accessToken: string) {
  storage.setProviderOptions({ accessToken });
}

export async function isCloudAvailable() {
  return storage.isCloudAvailable();
}

export async function uploadEnvelope(env: BackupEnvelope) {
  await storage.writeFile(path(env.account), JSON.stringify(env), CloudStorageScope.AppData);
}

export async function downloadEnvelope(account: string): Promise<BackupEnvelope | null> {
  if (!(await storage.exists(path(account), CloudStorageScope.AppData))) return null;
  return JSON.parse(await storage.readFile(path(account), CloudStorageScope.AppData)) as BackupEnvelope;
}
