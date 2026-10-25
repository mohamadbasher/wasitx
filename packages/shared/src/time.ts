import { TIME_ZONE, type Locale } from "./enums";

const intlLocale = (l: Locale | string) => (l === "ar" ? "ar-IL-u-nu-latn" : l === "he" ? "he-IL" : "en-IL");

/** All user-facing timestamps are shown in Asia/Jerusalem regardless of device time zone. */
export function formatDateTime(iso: string | Date, locale: Locale | string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

export function formatDate(iso: string | Date, locale: Locale | string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: TIME_ZONE, dateStyle: "medium" }).format(
    typeof iso === "string" ? new Date(iso) : iso,
  );
}

export function formatTime(iso: string | Date, locale: Locale | string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: TIME_ZONE, timeStyle: "short" }).format(
    typeof iso === "string" ? new Date(iso) : iso,
  );
}

/** "mm:ss" countdown to a deadline; "00:00" once passed. */
export function countdown(deadline: string | Date, now: Date = new Date()): string {
  const ms = Math.max(0, new Date(deadline).getTime() - now.getTime());
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
