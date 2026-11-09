import * as SecureStore from 'expo-secure-store';

/**
 * FR-003: share_D en el llavero del sistema con control de acceso biométrico
 * (iOS: Keychain con SecAccessControl .biometryCurrentSet; Android: Keystore/StrongBox con
 * autenticación requerida). THIS_DEVICE_ONLY: nunca entra a iCloud ni al backup de Android.
 * Si se añade una huella nueva, iOS invalida la entrada: el usuario recupera con el respaldo.
 */
const key = (account: string, epoch: number) => `hw.shareD.${account.toLowerCase()}.${epoch}`;
const OPTS: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: 'Confirma para usar tu llave',
  keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
};

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function storeDeviceShare(account: string, epoch: number, share: Uint8Array) {
  await SecureStore.setItemAsync(key(account, epoch), toB64(share), OPTS);
  share.fill(0);
}

/** Pide biometría. El llamador DEBE hacer .fill(0) al terminar. */
export async function loadDeviceShare(account: string, epoch: number): Promise<Uint8Array | null> {
  const v = await SecureStore.getItemAsync(key(account, epoch), OPTS);
  return v ? fromB64(v) : null;
}

export async function deleteDeviceShare(account: string, epoch: number) {
  await SecureStore.deleteItemAsync(key(account, epoch), OPTS);
}

/** Ejecuta fn con la parte y la borra de memoria pase lo que pase (CHK004). */
export async function withDeviceShare<T>(account: string, epoch: number, fn: (share: Uint8Array) => Promise<T>): Promise<T> {
  const share = await loadDeviceShare(account, epoch);
  if (!share) throw new Error('No encontramos la parte de este teléfono. Recupera tu billetera con el respaldo.');
  try { return await fn(share); } finally { share.fill(0); }
}
