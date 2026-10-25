"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, Lock, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { use, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Checkbox, ErrorState, Field, Input, KeyValue, Modal, Select, Skeleton, useToast } from "@wasitx/ui";
import { fiatForUsdt, formatIls, formatUsdt, parseIls, parsePrice, parseUsdt, usdtForFiat, type OfferDto, type QuoteDto, type TradeDto } from "@wasitx/shared";
import { Container, Num, PageHeader, TraderCell } from "@/components/app";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError, get, newIdempotencyKey, post } from "@/lib/api";
import { useErrorText, useFmt, useMe } from "@/lib/hooks";

type BankRow = { id: string; bankName: Record<string, string>; branchNumber: string; accountMasked: string; status: string };

const safe = <T,>(fn: () => T): T | null => {
  try {
    return fn();
  } catch {
    return null;
  }
};

export default function OfferPage({ params }: { params: Promise<{ id: string; locale: string }> }) {
  const { id, locale } = use(params);
  const t = useTranslations();
  const f = useFmt();
  const err = useErrorText();
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const offerQ = useQuery({ queryKey: ["offer", id], queryFn: () => get<OfferDto>(`/offers/${id}`) });
  const offer = offerQ.data;
  const takerIsSeller = offer?.side === "BUY";
  const banks = useQuery({ queryKey: ["banks"], queryFn: () => get<BankRow[]>("/bank-accounts"), enabled: !!me && takerIsSeller });

  const [mode, setMode] = useState<"USDT" | "ILS">("ILS");
  const [input, setInput] = useState("");
  const [bankId, setBankId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [idemKey, setIdemKey] = useState(newIdempotencyKey);
  const [submitting, setSubmitting] = useState(false);
  const [changedPrice, setChangedPrice] = useState<string | null>(null);

  // Exact conversion between ₪ and USDT with bigint minor units (never floats).
  const amountUsdt = useMemo(() => {
    if (!offer || !input) return null;
    const price = parsePrice(offer.priceIls);
    if (mode === "USDT") return safe(() => parseUsdt(input));
    const ag = safe(() => parseIls(input));
    return ag === null ? null : usdtForFiat(ag, price);
  }, [offer, input, mode]);
  const fiat = offer && amountUsdt ? fiatForUsdt(amountUsdt, parsePrice(offer.priceIls)) : null;
  const inLimits = !!(offer && fiat && fiat >= parseIls(offer.minOrderIls) && fiat <= parseIls(offer.maxOrderIls) && amountUsdt! <= parseUsdt(offer.remainingUsdt));

  const [debouncedAmount, setDebouncedAmount] = useState<string | null>(null);
  useEffect(() => {
    const h = setTimeout(() => setDebouncedAmount(amountUsdt && amountUsdt > 0n ? formatUsdt(amountUsdt) : null), 300);
    return () => clearTimeout(h);
  }, [amountUsdt]);
  const quote = useQuery({
    queryKey: ["quote", id, debouncedAmount],
    queryFn: () => get<QuoteDto>(`/market/quote?offerId=${id}&amountUsdt=${debouncedAmount}`),
    enabled: !!debouncedAmount && inLimits,
  });

  useEffect(() => {
    if (banks.data && !bankId) setBankId(banks.data.find((b) => b.status === "VERIFIED")?.id ?? "");
  }, [banks.data, bankId]);

  if (offerQ.isError) return <Container><ErrorState title={t("errors.OFFER_UNAVAILABLE")} onRetry={() => offerQ.refetch()} retryLabel={t("common.retry")} /></Container>;
  if (!offer) return <Container><Skeleton className="h-8 w-64" /><Skeleton className="mt-6 h-72 w-full" /></Container>;

  const eligible = me && me.ineligibility.length === 0;
  const userBuys = offer.side === "SELL";

  const submit = async () => {
    if (!amountUsdt) return;
    setSubmitting(true);
    try {
      const trade = await post<TradeDto>(
        "/trades",
        {
          offerId: offer.id,
          amountUsdt: formatUsdt(amountUsdt),
          quotedPriceIls: offer.priceIls,
          quotedVersion: offer.version,
          acceptFees: true,
          ...(takerIsSeller ? { bankAccountId: bankId } : {}),
        },
        idemKey,
      );
      qc.invalidateQueries({ queryKey: ["offers"] });
      router.push(`/trades/${trade.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "OFFER_CHANGED") {
        setChangedPrice((e.details as { priceIls?: string })?.priceIls ?? null);
        setConfirmOpen(false);
        setIdemKey(newIdempotencyKey());
        await offerQ.refetch();
      } else {
        toast("danger", err(e));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container className="max-w-5xl">
      <PageHeader back="/market" title={t("offer.detailsTitle")} />
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <TraderCell trader={offer.owner} />
            <Badge tone={offer.side === "SELL" ? "accent" : "info"}>{t(`offer.side_${offer.side}`)}</Badge>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-surface-2 p-4">
              <p className="text-xs text-subtle">{t("market.price")}</p>
              <p className="mt-1 text-2xl font-bold text-fg"><Num>{f.price(offer.priceIls)}</Num></p>
              <p className="text-xs text-muted">{t("common.perUsdt")}</p>
            </div>
            <div className="rounded-lg bg-surface-2 p-4">
              <p className="text-xs text-subtle">{t("market.available")}</p>
              <p className="mt-1 text-xl font-semibold text-fg"><Num>{f.usdt(offer.remainingUsdt)}</Num></p>
              <p className="text-xs text-muted">USDT</p>
            </div>
            <div className="rounded-lg bg-surface-2 p-4">
              <p className="text-xs text-subtle">{t("market.limits")}</p>
              <p className="mt-1 text-sm font-semibold text-fg"><Num>{f.ils(offer.minOrderIls)}</Num></p>
              <p className="text-sm font-semibold text-fg"><Num>{f.ils(offer.maxOrderIls)}</Num></p>
            </div>
          </div>
          <KeyValue
            className="mt-6"
            items={[
              { k: t("market.payment"), v: t(`enums.pm_${offer.paymentMethod}`) },
              { k: t("offer.expires"), v: f.dateTime(offer.expiresAt) },
              { k: t("trade.counterparty"), v: offer.owner.verified ? <span className="inline-flex items-center gap-1 text-accent-strong"><ShieldCheck className="size-4" />{t("common.verified")}</span> : t("common.unverified") },
            ]}
          />
          {offer.terms && (
            <div className="mt-6 rounded-lg border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{t("offer.terms")}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-fg/90">{offer.terms}</p>
            </div>
          )}
          <Alert tone="info" className="mt-6">{t("how.safety1")}</Alert>
        </Card>

        <Card className="h-fit p-6 lg:sticky lg:top-24">
          {changedPrice && <Alert tone="warning" className="mb-4">{t("offer.priceChanged", { price: changedPrice })}</Alert>}
          {offer.isMine ? (
            <Alert tone="info">{t("offer.ownOffer")}</Alert>
          ) : offer.status !== "ACTIVE" ? (
            <Alert tone="warning">{t(`offer.status_${offer.status}`)}</Alert>
          ) : (
            <div className="space-y-4">
              <Field label={mode === "ILS" ? (userBuys ? t("offer.youPay") : t("offer.youReceive")) + " (₪)" : (userBuys ? t("offer.youReceive") : t("offer.youSend")) + " (USDT)"} htmlFor="amt">
                <div className="flex gap-2">
                  <Input id="amt" inputMode="decimal" dir="ltr" value={input} onChange={(e) => setInput(e.target.value.replace(/[^\d.]/g, ""))} placeholder={mode === "ILS" ? offer.minOrderIls : "100"} aria-invalid={!!input && !inLimits} />
                  <Button type="button" variant="outline" onClick={() => { setMode(mode === "ILS" ? "USDT" : "ILS"); setInput(""); }} aria-label="Switch currency">
                    <ArrowDownUp className="size-4" /> {mode === "ILS" ? "₪" : "USDT"}
                  </Button>
                </div>
              </Field>
              {input && !inLimits && <p className="text-xs text-danger">{t("errors.ORDER_OUTSIDE_LIMITS")}</p>}

              {takerIsSeller && me && (
                <Field label={t("offer.receiveTo")}>
                  <Select value={bankId} onChange={(e) => setBankId(e.target.value)}>
                    <option value="">—</option>
                    {banks.data?.filter((b) => b.status === "VERIFIED").map((b) => (
                      <option key={b.id} value={b.id}>{b.bankName[locale] ?? b.bankName.en} · {b.branchNumber} · {b.accountMasked}</option>
                    ))}
                  </Select>
                </Field>
              )}

              <div className="rounded-lg bg-surface-2 p-4">
                <KeyValue
                  items={[
                    { k: t("trade.amount"), v: <Num>{amountUsdt ? `${f.usdt(formatUsdt(amountUsdt))} USDT` : "—"}</Num> },
                    { k: t("trade.total"), v: <Num>{fiat ? f.ils(formatIls(fiat)) : "—"}</Num>, strong: true },
                    { k: t("offer.fee", { rate: quote.data ? quote.data.fee.rateBps / 100 : "…" }), v: <Num>{quote.data ? `${quote.data.fee.feeUsdt} USDT` : "—"}</Num> },
                    userBuys
                      ? { k: t("offer.youReceive"), v: <Num>{quote.data ? `${f.usdt(quote.data.buyerReceivesUsdt)} USDT` : "—"}</Num>, strong: true }
                      : { k: t("trade.lock"), v: <Num>{quote.data ? `${f.usdt(quote.data.sellerLocksUsdt)} USDT` : "—"}</Num>, strong: true },
                  ]}
                />
              </div>

              {!me ? (
                <Link href={`/login?next=/offers/${offer.id}`}><Button block size="lg">{t("offer.loginToTrade")}</Button></Link>
              ) : !eligible ? (
                <Link href="/dashboard"><Button block size="lg" variant="outline">{t("offer.verifyToTrade")}</Button></Link>
              ) : (
                <Button block size="lg" variant={userBuys ? "primary" : "danger"} disabled={!inLimits || !quote.data || (takerIsSeller && !bankId)} onClick={() => { setAccepted(false); setConfirmOpen(true); }}>
                  {userBuys ? t("market.buyAction") : t("market.sellAction")} USDT
                </Button>
              )}
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t("offer.confirmTitle")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={submit} loading={submitting} disabled={!accepted}>{t("offer.placeOrder")}</Button>
          </>
        }
      >
        {quote.data && (
          <div className="space-y-4">
            <p className="flex items-center gap-2 rounded-md bg-accent/10 px-3 py-2 text-sm font-medium text-accent-strong">
              <Lock className="size-4" /> {t("offer.priceLock", { price: offer.priceIls })}
            </p>
            <KeyValue
              items={[
                { k: t("trade.amount"), v: <Num>{f.usdt(quote.data.amountUsdt)} USDT</Num> },
                { k: userBuys ? t("offer.youPay") : t("offer.youReceive"), v: <Num>{f.ils(quote.data.fiatAmountIls)}</Num>, strong: true },
                { k: t("offer.fee", { rate: quote.data.fee.rateBps / 100 }), v: <Num>{quote.data.fee.feeUsdt} USDT</Num> },
                { k: <span className="text-xs">{quote.data.fee.payer === "SELLER" ? t("offer.feeSeller") : t("offer.feeBuyer")}</span>, v: "" },
                userBuys
                  ? { k: t("offer.youReceive"), v: <Num>{f.usdt(quote.data.buyerReceivesUsdt)} USDT</Num>, strong: true }
                  : { k: t("trade.lock"), v: <Num>{f.usdt(quote.data.sellerLocksUsdt)} USDT</Num>, strong: true },
              ]}
            />
            <Checkbox label={t("offer.acceptFees")} checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          </div>
        )}
      </Modal>
    </Container>
  );
}
