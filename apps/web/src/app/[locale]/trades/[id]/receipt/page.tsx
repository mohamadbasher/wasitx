"use client";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { use } from "react";
import { Badge, Button, Card, KeyValue, Logo, Skeleton } from "@wasitx/ui";
import { Container, Num, RequireAuth } from "@/components/app";
import { BRAND, get } from "@/lib/api";
import { useFmt } from "@/lib/hooks";

interface Receipt {
  reference: string;
  paymentReference: string;
  role: "buyer" | "seller";
  completedAt: string;
  buyer: string;
  seller: string;
  amountUsdt: string;
  priceIls: string;
  fiatAmountIls: string;
  feeUsdt: string;
  feeRateBps: number;
  netUsdt: string;
  sandbox: boolean;
}

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations();
  const f = useFmt();
  const q = useQuery({ queryKey: ["receipt", id], queryFn: () => get<Receipt>(`/trades/${id}/receipt`) });
  return (
    <RequireAuth>
      {() => (
        <Container className="max-w-xl">
          <Card className="p-8 print:border-0 print:shadow-none">
            {!q.data ? (
              <Skeleton className="h-80" />
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <Logo brand={BRAND} />
                  {q.data.sandbox && <Badge tone="warning">{t("common.simulated")}</Badge>}
                </div>
                <h1 className="mt-6 text-xl font-bold text-fg">{t("trade.receipt")} · <span className="font-mono">{q.data.reference}</span></h1>
                <p className="num text-sm text-muted">{f.dateTime(q.data.completedAt)}</p>
                <KeyValue
                  className="mt-6"
                  items={[
                    { k: t("trade.actor_buyer"), v: q.data.buyer },
                    { k: t("trade.actor_seller"), v: q.data.seller },
                    { k: t("trade.amount"), v: <Num>{f.usdt(q.data.amountUsdt)} USDT</Num> },
                    { k: t("trade.price"), v: <Num>{f.price(q.data.priceIls)}</Num> },
                    { k: t("trade.total"), v: <Num>{f.ils(q.data.fiatAmountIls)}</Num>, strong: true },
                    { k: t("offer.fee", { rate: q.data.feeRateBps / 100 }), v: <Num>{q.data.feeUsdt} USDT</Num> },
                    { k: q.data.role === "buyer" ? t("trade.receive") : t("trade.lock"), v: <Num>{f.usdt(q.data.netUsdt)} USDT</Num>, strong: true },
                    { k: t("trade.reference"), v: <span className="font-mono">{q.data.paymentReference}</span> },
                  ]}
                />
                <p className="mt-6 text-xs text-subtle">{t("fees.vat")}</p>
              </>
            )}
          </Card>
          <div className="mt-4 text-center print:hidden">
            <Button variant="outline" onClick={() => window.print()}><Printer className="size-4" />Print</Button>
          </div>
        </Container>
      )}
    </RequireAuth>
  );
}
