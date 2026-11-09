import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

/**
 * Cliente del backend (contracts/backend-api.openapi.yaml).
 * JWT de 15 min + refresh rotativo en el llavero (FR-024). Nunca envía material de llave.
 */
const BASE: string = Constants.expoConfig?.extra?.apiUrl;
const REFRESH_KEY = 'hw.refresh';

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message = `HTTP ${status}`) { super(message); }
  get isOffline() { return this.status === 0; }
}

export async function setSession(s: { accessToken: string; refreshToken: string }) {
  accessToken = s.accessToken;
  await SecureStore.setItemAsync(REFRESH_KEY, s.refreshToken, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}

export async function clearSession() {
  accessToken = null;
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

async function refresh(): Promise<boolean> {
  const token = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!token) return false;
  const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: token }) });
  if (!res.ok) { await clearSession(); return false; }
  await setSession(await res.json());
  return true;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = init;
  const doFetch = () =>
    fetch(`${BASE}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(auth && accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body, (_, v) => (typeof v === 'bigint' ? v.toString() : v)),
    });

  let res: Response;
  try { res = await doFetch(); } catch (e) { throw new ApiError(0, null, 'offline'); }

  if (res.status === 401 && auth) {
    refreshing ??= refresh().finally(() => { refreshing = null; });
    if (await refreshing) res = await doFetch();
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data, (data as { error?: string })?.error);
  return data as T;
}
