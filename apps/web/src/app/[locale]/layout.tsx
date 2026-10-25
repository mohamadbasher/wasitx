import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, IBM_Plex_Sans_Hebrew, Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isRtl } from "@wasitx/shared";
import { messages } from "@wasitx/shared/i18n";
import { routing } from "@/i18n/routing";
import { Providers } from "@/components/providers";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { SandboxBanner } from "@/components/sandbox-banner";
import { BRAND } from "@/lib/api";
import "../globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const arabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "500", "600", "700"], variable: "--font-arabic", display: "swap" });
const hebrew = IBM_Plex_Sans_Hebrew({ subsets: ["hebrew"], weight: ["400", "500", "600", "700"], variable: "--font-hebrew", display: "swap" });

const fontStack: Record<string, string> = {
  ar: "var(--font-arabic), var(--font-inter), system-ui, sans-serif",
  he: "var(--font-hebrew), var(--font-inter), system-ui, sans-serif",
  en: "var(--font-inter), system-ui, sans-serif",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: { default: t("title", { brand: BRAND }), template: `%s · ${BRAND}` },
    description: t("description"),
    alternates: { languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}`])) },
    robots: process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true" ? undefined : { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#060a13" },
    { media: "(prefers-color-scheme: light)", color: "#f5f7fb" },
  ],
};

// Applies the saved theme before paint (no flash). Inline because it must run before hydration.
const themeScript = `try{var t=localStorage.getItem('wx-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return (
    <html lang={locale} dir={isRtl(locale) ? "rtl" : "ltr"} className={`${inter.variable} ${arabic.variable} ${hebrew.variable}`} style={{ ["--wx-font-sans" as string]: fontStack[locale] }} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="Asia/Jerusalem">
          <Providers>
            <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
              Skip to content
            </a>
            <SandboxBanner />
            <Header />
            <main id="main" className="min-h-[70dvh]">{children}</main>
            <Footer />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
