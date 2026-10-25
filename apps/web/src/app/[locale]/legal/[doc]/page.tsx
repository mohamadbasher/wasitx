import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Alert, Card } from "@wasitx/ui";
import { Container, PageHeader } from "@/components/app";
import { Link } from "@/i18n/navigation";
import { BRAND } from "@/lib/api";

const DOCS = ["terms", "privacy", "risk", "aml"] as const;
type Doc = (typeof DOCS)[number];

export function generateStaticParams() {
  return DOCS.map((doc) => ({ doc }));
}

export default function Legal({ params }: { params: Promise<{ locale: string; doc: string }> }) {
  const { locale, doc } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("legal");
  if (!DOCS.includes(doc as Doc)) notFound();
  const d = doc as Doc;
  return (
    <Container className="max-w-3xl">
      <PageHeader title={t(d)} />
      <Alert tone="warning">{t("draftNotice")}</Alert>
      <Card className="mt-6 p-6 leading-relaxed text-fg/90">{t(`${d}Body`, { brand: BRAND })}</Card>
      <nav className="mt-6 flex flex-wrap gap-4 text-sm">
        {DOCS.filter((x) => x !== d).map((x) => (
          <Link key={x} href={`/legal/${x}`} className="text-accent-strong hover:underline">
            {t(x)}
          </Link>
        ))}
      </nav>
    </Container>
  );
}
