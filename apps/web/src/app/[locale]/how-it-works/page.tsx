import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Card } from "@wasitx/ui";
import { Container, PageHeader } from "@/components/app";

export default function HowItWorks({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale);
  const t = useTranslations("how");
  return (
    <Container className="max-w-4xl">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <ol className="space-y-4">
        {([1, 2, 3, 4] as const).map((n) => (
          <Card key={n} className="flex gap-5 p-6">
            <span className="num grid size-11 shrink-0 place-items-center rounded-full bg-accent/12 font-bold text-accent-strong">{n}</span>
            <div>
              <h2 className="text-lg font-semibold text-fg">{t(`s${n}Title`)}</h2>
              <p className="mt-1.5 leading-relaxed text-muted">{t(`s${n}Body`)}</p>
            </div>
          </Card>
        ))}
      </ol>
      <h2 className="mt-12 text-xl font-semibold text-fg">{t("safetyTitle")}</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {([1, 2, 3, 4] as const).map((n) => (
          <li key={n} className="flex gap-3 rounded-lg border border-border bg-surface p-4 text-sm text-fg">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" /> {t(`safety${n}`)}
          </li>
        ))}
      </ul>
    </Container>
  );
}
