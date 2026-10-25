import { ArrowLeftRight, BadgePercent, Languages, Lock, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Button, Card } from "@wasitx/ui";
import { Link } from "@/i18n/navigation";
import { HomeStats, LiveOffers } from "./home-client";

export default function Home({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale);
  const t = useTranslations("home");
  const how = useTranslations("how");
  const why = [
    { icon: ShieldCheck, title: t("why1Title"), body: t("why1Body") },
    { icon: Lock, title: t("why2Title"), body: t("why2Body") },
    { icon: BadgePercent, title: t("why3Title"), body: t("why3Body") },
    { icon: Languages, title: t("why4Title"), body: t("why4Body") },
  ];
  const steps = [
    [how("s1Title"), how("s1Body")],
    [how("s2Title"), how("s2Body")],
    [how("s3Title"), how("s3Body")],
    [how("s4Title"), how("s4Body")],
  ];
  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <div className="wx-grid-bg absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" aria-hidden />
        <div className="wx-glow absolute inset-0" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pb-24 lg:pt-20">
          <div className="animate-rise">
            <p className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-strong">
              <span className="size-1.5 rounded-full bg-accent animate-pulse-dot" /> {t("eyebrow")}
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight text-fg sm:text-5xl lg:text-6xl">{t("title")}</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">{t("subtitle")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register">
                <Button size="lg">{t("ctaPrimary")}</Button>
              </Link>
              <Link href="/market">
                <Button size="lg" variant="outline">
                  <ArrowLeftRight className="size-4" /> {t("ctaSecondary")}
                </Button>
              </Link>
            </div>
            <HomeStats />
          </div>
          <LiveOffers />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight text-fg">{t("whyTitle")}</h2>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {why.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="p-6 transition-transform hover:-translate-y-0.5">
              <div className="grid size-11 place-items-center rounded-lg bg-accent/12 text-accent">
                <Icon className="size-5" />
              </div>
              <h3 className="mt-4 text-[17px] font-semibold text-fg">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface/50">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight text-fg">{t("stepsTitle")}</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-4">
            {steps.map(([title, body], i) => (
              <li key={i} className="relative">
                <span className="num grid size-10 place-items-center rounded-full border border-accent/40 bg-accent/10 text-sm font-bold text-accent-strong">{i + 1}</span>
                <h3 className="mt-4 font-semibold text-fg">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <Card className="wx-glow flex flex-col items-start justify-between gap-6 p-8 sm:flex-row sm:items-center sm:p-10">
          <div>
            <h2 className="text-2xl font-bold text-fg">{t("ctaBandTitle")}</h2>
            <p className="mt-2 text-muted">{t("ctaBandBody")}</p>
          </div>
          <Link href="/register">
            <Button size="lg">{t("ctaPrimary")}</Button>
          </Link>
        </Card>
      </section>
    </>
  );
}
