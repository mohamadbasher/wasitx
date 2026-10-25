import type { ApiErrorBody } from "@wasitx/shared";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4000/ws";
export const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? "WASIT X";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

function cookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie.split("; ").find((c) => c.startsWith(`${name}=`))?.split("=")[1];
}

/** Stable per-browser id for device recognition (new-device alerts). Not a credential. */
function deviceId(): string {
  try {
    let id = localStorage.getItem("wx-device");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("wx-device", id);
    }
    return id;
  } catch {
    return "unknown-device";
  }
}

export const newIdempotencyKey = () => crypto.randomUUID();

interface Options {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  form?: FormData;
  /** true = generate a key; string = reuse a key (e.g. retry of the same user action) */
  idempotency?: boolean | string;
  signal?: AbortSignal;
}

let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  refreshing ??= fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-device-id": deviceId() },
    body: "{}",
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export async function api<T>(path: string, opts: Options = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = { "x-device-id": deviceId() };
  if (!opts.form) headers["content-type"] = "application/json";
  const csrf = cookie("wx_csrf");
  if (csrf) headers["x-csrf-token"] = csrf;
  if (opts.idempotency) headers["idempotency-key"] = typeof opts.idempotency === "string" ? opts.idempotency : newIdempotencyKey();

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? "GET",
      credentials: "include",
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: opts.signal,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Network error");
  }

  // Only try a refresh if this browser has had a session (the CSRF cookie lives as long as the refresh token).
  if (res.status === 401 && !retried && csrf && !path.startsWith("/auth/login") && !path.startsWith("/auth/refresh")) {
    const body = (await res.clone().json().catch(() => ({}))) as Partial<ApiErrorBody>;
    if (body.code !== "MFA_REQUIRED" && body.code !== "INVALID_CREDENTIALS" && (await refresh())) {
      return api<T>(path, opts, true);
    }
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Partial<ApiErrorBody>;
    throw new ApiError(res.status, body.code ?? "INTERNAL_ERROR", body.message ?? res.statusText, body.details);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const get = <T,>(path: string, signal?: AbortSignal) => api<T>(path, { signal });
export const post = <T,>(path: string, body?: unknown, idempotency?: boolean | string) => api<T>(path, { method: "POST", body: body ?? {}, idempotency });
export const patch = <T,>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body });
export const put = <T,>(path: string, body: unknown) => api<T>(path, { method: "PUT", body });
export const del = <T,>(path: string) => api<T>(path, { method: "DELETE" });

export async function upload(file: File, purpose: "CHAT_ATTACHMENT" | "PAYMENT_EVIDENCE" | "DISPUTE_EVIDENCE", tradeId?: string) {
  const form = new FormData();
  form.append("file", file);
  const q = new URLSearchParams({ purpose, ...(tradeId ? { tradeId } : {}) });
  return api<{ id: string; fileName: string; mimeType: string; size: number }>(`/files?${q}`, { method: "POST", form });
}

export const fileUrl = (id: string) => `${API_URL}/files/${id}`;
