import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import type { ApiErrorBody } from "@wasitx/shared";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra?.apiUrl as string) ?? "http://localhost:4000/api/v1";
export const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? API_URL.replace(/\/api\/v1$/, "/ws");
export const BRAND = process.env.EXPO_PUBLIC_BRAND_NAME ?? "WASIT X";

const TOKENS = "wx.tokens";
const DEVICE = "wx.device";

type Tokens = { accessToken: string; refreshToken: string };
let cache: Tokens | null | undefined;

/** Tokens live in the OS keychain/keystore (expo-secure-store), never in AsyncStorage. */
export const tokens = {
  async get(): Promise<Tokens | null> {
    if (cache !== undefined) return cache;
    const raw = await SecureStore.getItemAsync(TOKENS);
    cache = raw ? (JSON.parse(raw) as Tokens) : null;
    return cache;
  },
  async set(t: Tokens) {
    cache = t;
    await SecureStore.setItemAsync(TOKENS, JSON.stringify(t), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  },
  async clear() {
    cache = null;
    await SecureStore.deleteItemAsync(TOKENS);
  },
};

async function deviceId(): Promise<string> {
  let id = await SecureStore.getItemAsync(DEVICE);
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    await SecureStore.setItemAsync(DEVICE, id);
  }
  return id;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export const newKey = () => `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  const t = await tokens.get();
  if (!t) return false;
  refreshing ??= fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-client": "mobile", "x-device-id": await deviceId() },
    body: JSON.stringify({ refreshToken: t.refreshToken }),
  })
    .then(async (r) => {
      if (!r.ok) {
        await tokens.clear();
        return false;
      }
      const j = (await r.json()) as Tokens;
      await tokens.set({ accessToken: j.accessToken, refreshToken: j.refreshToken });
      return true;
    })
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; idempotency?: string; form?: FormData } = {}, retried = false): Promise<T> {
  const t = await tokens.get();
  const headers: Record<string, string> = { "x-client": "mobile", "x-device-id": await deviceId() };
  if (!opts.form) headers["content-type"] = "application/json";
  if (t) headers.authorization = `Bearer ${t.accessToken}`;
  if (opts.idempotency) headers["idempotency-key"] = opts.idempotency;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method: opts.method ?? "GET", headers, body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined) });
  } catch {
    throw new ApiError(0, "NETWORK", "Network error");
  }
  if (res.status === 401 && !retried && t && !path.startsWith("/auth/login")) {
    if (await refresh()) return api<T>(path, opts, true);
  }
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as Partial<ApiErrorBody>;
    throw new ApiError(res.status, b.code ?? "INTERNAL_ERROR", b.message ?? "", b.details);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const get = <T,>(p: string) => api<T>(p);
export const post = <T,>(p: string, body: unknown = {}, idempotency?: string) => api<T>(p, { method: "POST", body, idempotency });

export async function login(email: string, password: string, totp?: string) {
  const r = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-client": "mobile", "x-device-id": await deviceId() },
    body: JSON.stringify({ email, password, ...(totp ? { totp } : {}), deviceName: "Mobile app" }),
  });
  const j = await r.json();
  if (!r.ok) throw new ApiError(r.status, j.code, j.message);
  await tokens.set({ accessToken: j.accessToken, refreshToken: j.refreshToken });
}

export async function register(body: Record<string, unknown>) {
  const r = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-client": "mobile", "x-device-id": await deviceId() },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new ApiError(r.status, j.code, j.message, j.details);
  await tokens.set({ accessToken: j.accessToken, refreshToken: j.refreshToken });
}

export async function uploadFile(uri: string, name: string, mime: string, purpose: string, tradeId?: string) {
  const form = new FormData();
  form.append("file", { uri, name, type: mime } as unknown as Blob);
  const q = `purpose=${purpose}${tradeId ? `&tradeId=${tradeId}` : ""}`;
  return api<{ id: string; fileName: string }>(`/files?${q}`, { method: "POST", form });
}
