import { BookOpen, LifeBuoy, MessageCircleQuestion, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Card } from "@wasitx/ui";
import { Container, PageHeader } from "@/components/app";
import { Link } from "@/i18n/navigation";
import { BRAND } from "@/lib/api";

export default function Help({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale);
  const t = useTranslations();
  const items = [
    { href: "/how-it-works", icon: BookOpen, title: t("nav.howItWorks"), body: t("how.subtitle") },
    { href: "/faq", icon: MessageCircleQuestion, title: t("nav.faq"), body: t("faq.q3") },
    { href: "/legal/risk", icon: ShieldAlert, title: t("footer.risk"), body: t("how.safety1") },
    { href: "/support", icon: LifeBuoy, title: t("support.title"), body: t("contact.subtitle") },
  ];
  return (
    <Container className="max-w-4xl">
      <PageHeader title={t("support.helpTitle")} subtitle={t("support.helpSubtitle")} />
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map(({ href, icon: Icon, title, body }) => (
          <Link key={href} href={href}>
            <Card className="h-full p-6 transition-colors hover:border-accent/50">
              <Icon className="size-5 text-accent" />
              <p className="mt-3 font-semibold text-fg">{title}</p>
              <p className="mt-1.5 text-sm text-muted">{body.replace("{brand}", BRAND)}</p>
            </Card>
          </Link>
        ))}
      </div>
    </Container>
  );
}
