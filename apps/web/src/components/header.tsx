"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ChevronDown, Globe, LogOut, Menu, Monitor, Moon, Sun, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Avatar, Button, cn, Logo } from "@wasitx/ui";
import { LOCALES } from "@wasitx/shared";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { get, post, BRAND } from "@/lib/api";
import { useMe, useRealtime } from "@/lib/hooks";

const LANG_LABEL: Record<string, string> = { ar: "العربية", he: "עברית", en: "English" };

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onOut();
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ref, onOut]);
}

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("common");
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{t("language")}</span>
      <Globe className="pointer-events-none absolute start-2.5 size-4 text-muted" aria-hidden />
      <select
        value={locale}
        onChange={(e) => router.replace(pathname, { locale: e.target.value })}
        className="h-9 appearance-none rounded-md border border-border bg-transparent ps-8 pe-3 text-sm font-medium text-fg hover:bg-surface-2"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} className="bg-surface">
            {LANG_LABEL[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ThemeToggle() {
  const t = useTranslations("common");
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("wx-theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {}
  }, []);
  const cycle = () => {
    const next = theme === "system" ? "dark" : theme === "dark" ? "light" : "system";
    setTheme(next);
    try {
      if (next === "system") {
        localStorage.removeItem("wx-theme");
        delete document.documentElement.dataset.theme;
      } else {
        localStorage.setItem("wx-theme", next);
        document.documentElement.dataset.theme = next;
      }
    } catch {}
  };
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const label = theme === "dark" ? t("themeDark") : theme === "light" ? t("themeLight") : t("themeSystem");
  return (
    <button onClick={cycle} className="grid size-9 place-items-center rounded-md border border-border text-muted hover:bg-surface-2 hover:text-fg" aria-label={`${t("theme")}: ${label}`} title={`${t("theme")}: ${label}`}>
      <Icon className="size-4" />
    </button>
  );
}

function NotificationsBell() {
  const t = useTranslations("nav");
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: () => get<{ unread: number }>("/notifications"), refetchInterval: 60_000 });
  useRealtime({ "notification.created": () => qc.invalidateQueries({ queryKey: ["notifications"] }) }, [qc]);
  const unread = data?.unread ?? 0;
  return (
    <Link href="/notifications" className="relative grid size-9 place-items-center rounded-md border border-border text-muted hover:bg-surface-2 hover:text-fg" aria-label={`${t("notifications")}${unread ? ` (${unread})` : ""}`}>
      <Bell className="size-4" />
      {unread > 0 && <span className="absolute -end-1 -top-1 grid min-w-4.5 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
    </Link>
  );
}

function UserMenu({ name }: { name: string }) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const router = useRouter();
  useClickOutside(ref, () => setOpen(false));
  const logout = async () => {
    await post("/auth/logout").catch(() => undefined);
    qc.clear();
    router.replace("/");
  };
  const links: [string, string][] = [
    ["/dashboard", t("dashboard")],
    ["/trades", t("trades")],
    ["/my-offers", t("myOffers")],
    ["/wallet", t("wallet")],
    ["/profile", t("profile")],
    ["/security", t("security")],
    ["/bank-accounts", t("bankAccounts")],
    ["/kyc", t("kyc")],
    ["/support", t("support")],
  ];
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-md py-1 ps-1 pe-2 hover:bg-surface-2" aria-expanded={open} aria-haspopup="menu">
        <Avatar name={name} size={30} />
        <span className="hidden max-w-28 truncate text-sm font-medium sm:block">{name}</span>
        <ChevronDown className="size-4 text-muted" />
      </button>
      {open && (
        <div role="menu" className="absolute end-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-2xl animate-rise">
          {links.map(([href, label]) => (
            <Link key={href} href={href} role="menuitem" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-fg hover:bg-surface-2">
              {label}
            </Link>
          ))}
          <button role="menuitem" onClick={logout} className="flex w-full items-center gap-2 border-t border-border px-4 py-2.5 text-start text-sm text-danger hover:bg-surface-2">
            <LogOut className="size-4" /> {t("logout")}
          </button>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const t = useTranslations("nav");
  const { data: me, isLoading } = useMe();
  const pathname = usePathname();
  const [mobile, setMobile] = useState(false);
  useEffect(() => setMobile(false), [pathname]);

  const nav: [string, string][] = [
    ["/market", t("market")],
    ["/how-it-works", t("howItWorks")],
    ["/fees", t("fees")],
    ["/help", t("help")],
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" aria-label={BRAND}>
          <Logo brand={BRAND} />
        </Link>
        <nav className="ms-6 hidden items-center gap-1 lg:flex" aria-label="Main">
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className={cn("rounded-md px-3 py-2 text-sm font-medium transition-colors", pathname.startsWith(href) ? "text-fg" : "text-muted hover:text-fg")}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 md:flex">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
          {isLoading ? null : me ? (
            <>
              <NotificationsBell />
              <UserMenu name={me.displayName} />
            </>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link href="/login" className="rounded-md px-3 py-2 text-sm font-semibold text-fg hover:bg-surface-2">
                {t("login")}
              </Link>
              <Link href="/register">
                <Button size="sm">{t("register")}</Button>
              </Link>
            </div>
          )}
          <button onClick={() => setMobile((m) => !m)} className="grid size-9 place-items-center rounded-md border border-border lg:hidden" aria-label={t("menu")} aria-expanded={mobile}>
            {mobile ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>
      {mobile && (
        <div className="border-t border-border bg-surface px-4 py-4 lg:hidden animate-fade-in">
          <nav className="grid gap-1" aria-label="Mobile">
            {nav.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-md px-3 py-2.5 text-[15px] font-medium hover:bg-surface-2">
                {label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
          {!me && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link href="/login">
                <Button variant="outline" block>{t("login")}</Button>
              </Link>
              <Link href="/register">
                <Button block>{t("register")}</Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
