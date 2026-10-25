"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { MeDto, PublicConfigDto } from "@wasitx/shared";
import { ApiError, BRAND, WS_URL, get } from "./api";

export function useMe() {
  return useQuery<MeDto | null>({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await get<MeDto>("/auth/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 30_000,
  });
}

export function usePublicConfig() {
  return useQuery<PublicConfigDto>({ queryKey: ["config"], queryFn: () => get("/config/public"), staleTime: 5 * 60_000 });
}

/** Translates an API error code (falls back to a generic message). */
export function useErrorText() {
  const t = useTranslations("errors");
  return (e: unknown): string => {
    const code = e instanceof ApiError ? e.code : "INTERNAL_ERROR";
    return t.has(code as never) ? t(code as never) : t("INTERNAL_ERROR");
  };
}

const intlLocale = (l: string) => (l === "ar" ? "ar-IL-u-nu-latn" : l === "he" ? "he-IL" : "en-IL");

/** Formats decimal strings from the API without converting them to floating point. */
export function useFmt() {
  const locale = useLocale();
  return useMemo(() => {
    const group = (s: string) => {
      const neg = s.startsWith("-");
      const [w, f] = s.replace("-", "").split(".");
      const grouped = new Intl.NumberFormat(intlLocale(locale)).format(BigInt(w || "0"));
      return `${neg ? "-" : ""}${grouped}${f ? `.${f}` : ""}`;
    };
    const fixed = (s: string, dp: number) => {
      const [w, f = ""] = s.split(".");
      return dp ? `${w}.${(f + "0".repeat(dp)).slice(0, dp)}` : w!;
    };
    const tz = { timeZone: "Asia/Jerusalem" } as const;
    return {
      ils: (s: string | null | undefined) => (s == null ? "—" : `₪${group(fixed(s, 2))}`),
      usdt: (s: string | null | undefined) => (s == null ? "—" : `${group(s.includes(".") ? s : `${s}.00`)}`),
      price: (s: string | null | undefined) => (s == null ? "—" : `₪${group(fixed(s, Math.max(2, (s.split(".")[1] ?? "").length)))}`),
      dateTime: (iso: string) => new Intl.DateTimeFormat(intlLocale(locale), { ...tz, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)),
      date: (iso: string) => new Intl.DateTimeFormat(intlLocale(locale), { ...tz, dateStyle: "medium" }).format(new Date(iso)),
      time: (iso: string) => new Intl.DateTimeFormat(intlLocale(locale), { ...tz, timeStyle: "short" }).format(new Date(iso)),
    };
  }, [locale]);
}

export const brand = BRAND;

let socket: Socket | null = null;
export function getSocket(): Socket {
  socket ??= io(WS_URL, { withCredentials: true, transports: ["websocket", "polling"] });
  return socket;
}

/** Subscribes to realtime events and invalidates the matching queries. */
export function useRealtime(events: Record<string, (payload: unknown) => void>, deps: unknown[] = []) {
  useEffect(() => {
    const s = getSocket();
    for (const [e, fn] of Object.entries(events)) s.on(e, fn);
    return () => {
      for (const [e, fn] of Object.entries(events)) s.off(e, fn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function useTradeRoom(tradeId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const s = getSocket();
    const join = () => s.emit("trade.join", { tradeId });
    join();
    s.on("connect", join);
    const onTrade = (p: { tradeId: string }) => p.tradeId === tradeId && qc.invalidateQueries({ queryKey: ["trade", tradeId] });
    const onMsg = (p: { tradeId: string }) => p.tradeId === tradeId && qc.invalidateQueries({ queryKey: ["messages", tradeId] });
    s.on("trade.updated", onTrade);
    s.on("message.created", onMsg);
    s.on("message.read", onMsg);
    return () => {
      s.emit("trade.leave", { tradeId });
      s.off("connect", join);
      s.off("trade.updated", onTrade);
      s.off("message.created", onMsg);
      s.off("message.read", onMsg);
    };
  }, [tradeId, qc]);
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
