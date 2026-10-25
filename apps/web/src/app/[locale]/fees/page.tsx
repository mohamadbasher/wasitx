"use client";
import { useTranslations } from "next-intl";
import { Card, KeyValue, Skeleton } from "@wasitx/ui";
import { formatUsdt, parseUsdt, quoteFee } from "@wasitx/shared";
import { Container, PageHeader } from "@/components/app";
import { usePublicConfig } from "@/lib/hooks";

export default function Fees() {
  const t = useTranslations("fees");
  const { data } = usePublicConfig();
  const rate = data ? (data.fee.rateBps / 100).toString() : "…";
  const receive = data
    ? formatUsdt(
        quoteFee(parseUsdt("1000"), {
          rateBps: data.fee.rateBps,
          minUsdtMicro: parseUsdt(data.fee.minUsdt === "0.00" ? "0.000001" : data.fee.minUsdt),
          maxUsdtMicro: parseUsdt(data.fee.maxUsdt),
          payer: "BUYER",
        }).buyerReceivesMicro,
      )
    : "…";
  return (
    <Container className="max-w-3xl">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <Card className="p-6">
        {data ? (
          <KeyValue
            items={[
              { k: t("commission"), v: t("commissionValue", { rate }), strong: true },
              { k: t("minimum"), v: <span className="num">{data.fee.minUsdt} USDT</span> },
              { k: t("maximum"), v: <span className="num">{data.fee.maxUsdt} USDT</span> },
              { k: t("payer"), v: t(`payer_${data.fee.payer}`) },
            ]}
          />
        ) : (
          <Skeleton className="h-40 w-full" />
        )}
        <p className="mt-4 rounded-md bg-surface-2 p-3 text-sm text-muted">{t("example", { rate, receive })}</p>
      </Card>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          [t("makerFree"), ""],
          [t("withdrawal"), t("withdrawalBody")],
          [t("bank"), t("bankBody")],
        ].map(([title, body]) => (
          <Card key={title} className="p-5">
            <p className="font-semibold text-fg">{title}</p>
            {body && <p className="mt-1.5 text-sm text-muted">{body}</p>}
          </Card>
        ))}
      </div>
      <p className="mt-6 text-xs text-subtle">{t("vat")}</p>
    </Container>
  );
}
