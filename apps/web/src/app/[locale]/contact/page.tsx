import { Clock, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Button, Card } from "@wasitx/ui";
import { Container, PageHeader } from "@/components/app";
import { Link } from "@/i18n/navigation";

export default function Contact({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale);
  const t = useTranslations("contact");
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@wasitx.example";
  return (
    <Container className="max-w-3xl">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-6">
          <Mail className="size-5 text-accent" />
          <p className="mt-3 text-sm text-muted">{t("email")}</p>
          <a href={`mailto:${email}`} className="font-semibold text-fg hover:underline" dir="ltr">
            {email}
          </a>
        </Card>
        <Card className="p-6">
          <Clock className="size-5 text-accent" />
          <p className="mt-3 text-sm text-muted">{t("hours")}</p>
          <p className="font-semibold text-fg">{t("hoursValue")}</p>
        </Card>
      </div>
      <Link href="/support" className="mt-6 inline-block">
        <Button>{t("openTicket")}</Button>
      </Link>
    </Container>
  );
}
