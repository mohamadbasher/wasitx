"use client";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { use } from "react";
import { Skeleton } from "@wasitx/ui";
import type { OfferDto } from "@wasitx/shared";
import { Container, PageHeader, RequireAuth } from "@/components/app";
import { OfferForm } from "@/components/offer-form";
import { get } from "@/lib/api";

export default function EditOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("offer");
  const q = useQuery({ queryKey: ["offer", id, "edit"], queryFn: () => get<OfferDto>(`/offers/${id}`) });
  return (
    <RequireAuth>
      {() => (
        <Container className="max-w-2xl">
          <PageHeader back="/my-offers" title={t("editTitle")} />
          {q.data ? <OfferForm existing={q.data} /> : <Skeleton className="h-96" />}
        </Container>
      )}
    </RequireAuth>
  );
}
