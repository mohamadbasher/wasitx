import { defineRouting } from "next-intl/routing";
import { LOCALES, type Locale } from "@wasitx/shared";

const fallback = (process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? "ar") as Locale;

export const routing = defineRouting({
  locales: [...LOCALES],
  defaultLocale: LOCALES.includes(fallback) ? fallback : "ar",
  localePrefix: "always",
});
