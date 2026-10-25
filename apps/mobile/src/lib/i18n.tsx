import { getLocales } from "expo-localization";
import * as SecureStore from "expo-secure-store";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { IntlProvider, useTranslations } from "use-intl";
import { LOCALES, isRtl, type Locale } from "@wasitx/shared";
import { messages } from "@wasitx/shared/i18n";
import { ApiError } from "./api";

const KEY = "wx.locale";
type Ctx = { locale: Locale; rtl: boolean; setLocale: (l: Locale) => void };
const LocaleCtx = createContext<Ctx>({ locale: "ar", rtl: true, setLocale: () => undefined });
export const useLocale = () => useContext(LocaleCtx);

function deviceLocale(): Locale {
  const tag = getLocales()[0]?.languageCode ?? "ar";
  return (LOCALES as readonly string[]).includes(tag) ? (tag as Locale) : "ar";
}

/**
 * Locale + direction. Direction is applied with the `direction` style on the root view so switching
 * between Arabic/Hebrew (RTL) and English (LTR) works instantly without restarting the app.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(deviceLocale());
  useEffect(() => {
    void SecureStore.getItemAsync(KEY).then((l) => l && (LOCALES as readonly string[]).includes(l) && setLocaleState(l as Locale));
  }, []);
  const value = useMemo<Ctx>(
    () => ({
      locale,
      rtl: isRtl(locale),
      setLocale: (l) => {
        setLocaleState(l);
        void SecureStore.setItemAsync(KEY, l);
      },
    }),
    [locale],
  );
  return (
    <LocaleCtx.Provider value={value}>
      <IntlProvider locale={locale} messages={messages[locale]} timeZone="Asia/Jerusalem" onError={() => undefined}>
        {children}
      </IntlProvider>
    </LocaleCtx.Provider>
  );
}

export function useErrorText() {
  const t = useTranslations("errors");
  return (e: unknown) => {
    const code = e instanceof ApiError ? e.code : "INTERNAL_ERROR";
    return t.has(code as never) ? t(code as never) : t("INTERNAL_ERROR");
  };
}

const groupDigits = (w: string) => w.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const fixed = (s: string, dp: number) => {
  const [w, f = ""] = s.split(".");
  return dp ? `${w}.${(f + "0".repeat(dp)).slice(0, dp)}` : w!;
};

/** Decimal-string formatting (no floating point). Latin digits in all locales, as is common in Israel. */
export const fmt = {
  ils: (s?: string | null) => (s == null ? "—" : `₪${(([w, f]) => `${groupDigits(w!)}.${f}`)(fixed(s, 2).split("."))}`),
  usdt: (s?: string | null) => (s == null ? "—" : (([w, f]) => `${groupDigits(w!)}${f ? `.${f}` : ".00"}`)(s.split("."))),
  price: (s?: string | null) => (s == null ? "—" : `₪${s}`),
  dateTime: (iso: string, locale: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-IL-u-nu-latn" : locale === "he" ? "he-IL" : "en-IL", { timeZone: "Asia/Jerusalem", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)),
};
