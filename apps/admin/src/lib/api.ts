import type { ApiErrorBody } from "@wasitx/shared";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
export const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? "WASIT X";

/**
 * Staff console auth: bearer tokens kept in sessionStorage (cleared when the tab closes) instead of
 * cookies, so a staff session can never be shared with the customer web app on the same parent domain.
 * See docs/adr/0008-admin-bearer-sessions.md.
 */
const KEY = "wx-admin-session";
type Session = { accessToken: string; refreshToken: string };

export const session = {
  get(): Session | null {
    try {
      const raw = sessionStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  },
  set(s: Session) {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  },
  clear() {
    sessionStorage.removeItem(KEY);
  },
};

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  const s = session.get();
  if (!s) return false;
  refreshing ??= fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-client": "mobile" },
    body: JSON.stringify({ refreshToken: s.refreshToken }),
  })
    .then(async (r) => {
      if (!r.ok) {
        session.clear();
        return false;
      }
      const j = (await r.json()) as Session;
      session.set({ accessToken: j.accessToken, refreshToken: j.refreshToken });
      return true;
    })
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; raw?: boolean } = {}, retried = false): Promise<T> {
  const s = session.get();
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "content-type": "application/json",
      "x-client": "mobile",
      ...(s ? { authorization: `Bearer ${s.accessToken}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  }).catch(() => {
    throw new ApiError(0, "NETWORK", "Network error");
  });
  if (res.status === 401 && !retried && s && !path.startsWith("/auth/")) {
    if (await refresh()) return api<T>(path, opts, true);
  }
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as Partial<ApiErrorBody>;
    throw new ApiError(res.status, b.code ?? "INTERNAL_ERROR", b.message ?? res.statusText, b.details);
  }
  if (opts.raw) return (await res.text()) as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const get = <T,>(p: string) => api<T>(p);
export const post = <T,>(p: string, body: unknown = {}) => api<T>(p, { method: "POST", body });
export const put = <T,>(p: string, body: unknown) => api<T>(p, { method: "PUT", body });

export const errorText = (e: unknown) => (e instanceof ApiError ? `${e.code}${e.message && e.message !== e.code ? ` — ${e.message}` : ""}` : String(e));

/** Downloads an authenticated CSV export. */
export async function download(path: string, filename: string) {
  const csv = await api<string>(path, { raw: true });
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
