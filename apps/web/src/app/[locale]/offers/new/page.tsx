"use client";
import { useTranslations } from "next-intl";
import { Alert } from "@wasitx/ui";
import { Container, PageHeader, RequireAuth } from "@/components/app";
import { OfferForm } from "@/components/offer-form";
import { Link } from "@/i18n/navigation";

export default function NewOfferPage() {
  const t = useTranslations();
  return (
    <RequireAuth>
      {(me) => (
        <Container className="max-w-2xl">
          <PageHeader back="/my-offers" title={t("offer.createTitle")} />
          {me.ineligibility.length ? (
            <Alert tone="warning" title={t("offer.verifyToTrade")}>
              <Link href="/dashboard" className="font-semibold text-accent-strong hover:underline">{t("onboarding.nextStep")}</Link>
            </Alert>
          ) : (
            <OfferForm />
          )}
        </Container>
      )}
    </RequireAuth>
  );
}
