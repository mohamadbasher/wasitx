"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Pencil, Play, Plus, Tag, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, EmptyState, Skeleton, useToast } from "@wasitx/ui";
import type { OfferDto } from "@wasitx/shared";
import { Container, Num, PageHeader, RequireAuth } from "@/components/app";
import { Link } from "@/i18n/navigation";
import { get, post } from "@/lib/api";
import { useErrorText, useFmt } from "@/lib/hooks";

export default function MyOffersPage() {
  const t = useTranslations();
  const f = useFmt();
  const err = useErrorText();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["my-offers"], queryFn: () => get<OfferDto[]>("/offers/mine") });
  const act = async (id: string, action: "pause" | "resume" | "cancel") => {
    try {
      await post(`/offers/${id}/${action}`);
      qc.invalidateQueries({ queryKey: ["my-offers"] });
    } catch (e) {
      toast("danger", err(e));
    }
  };
  return (
    <RequireAuth>
      {() => (
        <Container>
          <PageHeader title={t("offer.myOffersTitle")} action={<Link href="/offers/new"><Button><Plus className="size-4" />{t("dashboard.newOffer")}</Button></Link>} />
          <Card className="overflow-hidden">
            {q.isLoading ? (
              <Skeleton className="m-4 h-40" />
            ) : !q.data?.length ? (
              <EmptyState icon={<Tag className="size-5" />} title={t("offer.noOffers")} />
            ) : (
              <ul className="divide-y divide-border">
                {q.data.map((o) => {
                  const open = ["ACTIVE", "PAUSED", "EXHAUSTED"].includes(o.status);
                  return (
                    <li key={o.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Badge tone={o.side === "SELL" ? "accent" : "info"}>{t(`offer.side_${o.side}`)}</Badge>
                        <div>
                          <p className="font-semibold text-fg"><Num>{f.price(o.priceIls)}</Num> <span className="text-sm font-normal text-muted">{t("common.perUsdt")}</span></p>
                          <p className="text-xs text-muted">{t("offer.remaining")}: <Num>{f.usdt(o.remainingUsdt)} / {f.usdt(o.amountUsdt)} USDT</Num> · <Num>{f.ils(o.minOrderIls)}–{f.ils(o.maxOrderIls)}</Num></p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={o.status === "ACTIVE" ? "success" : o.status === "PAUSED" ? "warning" : "neutral"}>{t(`offer.status_${o.status}`)}</Badge>
                        {open && <Link href={`/offers/${o.id}/edit`}><Button size="sm" variant="ghost" aria-label={t("common.edit")}><Pencil className="size-4" /></Button></Link>}
                        {o.status === "ACTIVE" && <Button size="sm" variant="ghost" onClick={() => act(o.id, "pause")} aria-label={t("offer.pause")}><Pause className="size-4" /></Button>}
                        {o.status === "PAUSED" && <Button size="sm" variant="ghost" onClick={() => act(o.id, "resume")} aria-label={t("offer.resume")}><Play className="size-4" /></Button>}
                        {open && <Button size="sm" variant="ghost" className="text-danger" onClick={() => act(o.id, "cancel")} aria-label={t("common.cancel")}><X className="size-4" /></Button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </Container>
      )}
    </RequireAuth>
  );
}
