import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Container, PageHeader } from "@/components/app";
import { BRAND } from "@/lib/api";

export default function Faq({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale);
  const t = useTranslations("faq");
  return (
    <Container className="max-w-3xl">
      <PageHeader title={t("title")} />
      <div className="divide-y divide-border rounded-xl border border-border bg-surface">
        {([1, 2, 3, 4, 5, 6, 7] as const).map((n) => (
          <details key={n} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-fg">
              {t(`q${n}`, { brand: BRAND })}
              <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-3 leading-relaxed text-muted">{t(`a${n}`, { brand: BRAND })}</p>
          </details>
        ))}
      </div>
    </Container>
  );
}
