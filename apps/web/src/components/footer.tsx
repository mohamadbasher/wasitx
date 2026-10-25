import { useTranslations } from "next-intl";
import { Logo } from "@wasitx/ui";
import { Link } from "@/i18n/navigation";
import { BRAND } from "@/lib/api";

export function Footer() {
  const t = useTranslations("footer");
  const n = useTranslations("nav");
  const c = useTranslations("common");
  const cols: { title: string; links: [string, string][] }[] = [
    { title: t("product"), links: [["/market", n("market")], ["/buy", n("buy")], ["/sell", n("sell")], ["/fees", n("fees")]] },
    { title: t("company"), links: [["/how-it-works", n("howItWorks")], ["/faq", n("faq")], ["/help", n("help")], ["/contact", t("contact")]] },
    { title: t("legal"), links: [["/legal/terms", t("terms")], ["/legal/privacy", t("privacy")], ["/legal/risk", t("risk")], ["/legal/aml", t("aml")]] },
  ];
  return (
    <footer className="mt-24 border-t border-border bg-surface/40">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-3">
          <Logo brand={BRAND} />
          <p className="max-w-xs text-sm text-muted">{t("tagline")}</p>
          <p className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted">🇮🇱 {c("israelOnly")} · ILS · USDT</p>
        </div>
        {cols.map((col) => (
          <div key={col.title}>
            <p className="text-sm font-semibold text-fg">{col.title}</p>
            <ul className="mt-3 space-y-2">
              {col.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-muted hover:text-fg">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto max-w-7xl space-y-2 px-4 py-6 text-xs text-subtle sm:px-6">
          <p>{t("disclaimer", { brand: BRAND })}</p>
          <p>{t("rights", { year: new Date().getFullYear(), brand: BRAND })}</p>
        </div>
      </div>
    </footer>
  );
}
