import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "use-intl";
import { fiatForUsdt, formatIls, formatUsdt, parseIls, parsePrice, parseUsdt, usdtForFiat, type OfferDto, type QuoteDto, type TradeDto } from "@wasitx/shared";
import { Badge, Button, Card, Check, Input, Loading, Notice, Row, Screen, T } from "@/components/ui";
import { ApiError, get, newKey, post } from "@/lib/api";
import { fmt, useErrorText } from "@/lib/i18n";
import { useMe } from "@/lib/session";

type Bank = { id: string; branchNumber: string; accountMasked: string; status: string };
const safe = <T,>(f: () => T) => { try { return f(); } catch { return null; } };

export default function OfferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const err = useErrorText();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const offerQ = useQuery({ queryKey: ["offer", id], queryFn: () => get<OfferDto>(`/offers/${id}`) });
  const o = offerQ.data;
  const banks = useQuery({ queryKey: ["banks"], queryFn: () => get<Bank[]>("/bank-accounts"), enabled: o?.side === "BUY" });
  const [ils, setIls] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = useMemo(() => {
    if (!o || !ils) return null;
    const ag = safe(() => parseIls(ils));
    return ag ? usdtForFiat(ag, parsePrice(o.priceIls)) : null;
  }, [o, ils]);
  const fiat = o && amount ? fiatForUsdt(amount, parsePrice(o.priceIls)) : null;
  const ok = !!(o && fiat && amount && fiat >= parseIls(o.minOrderIls) && fiat <= parseIls(o.maxOrderIls) && amount <= parseUsdt(o.remainingUsdt));
  const [dq, setDq] = useState<string | null>(null);
  useEffect(() => {
    const h = setTimeout(() => setDq(ok && amount ? formatUsdt(amount) : null), 300);
    return () => clearTimeout(h);
  }, [ok, amount]);
  const quote = useQuery({ queryKey: ["quote", id, dq], queryFn: () => get<QuoteDto>(`/market/quote?offerId=${id}&amountUsdt=${dq}`), enabled: !!dq });

  if (!o) return <Screen><Loading /></Screen>;
  const buying = o.side === "SELL";
  const bank = banks.data?.find((b) => b.status === "VERIFIED");

  return (
    <Screen>
      <Card>
        <Badge text={t(`offer.side_${o.side}`)} tone={buying ? "accent" : "info"} />
        <T v="h2">{o.owner.displayName}</T>
        <T v="num" style={{ fontSize: 28, fontWeight: "700" }}>{fmt.price(o.priceIls)}</T>
        <Row k={t("market.available")} v={`${fmt.usdt(o.remainingUsdt)} USDT`} />
        <Row k={t("market.limits")} v={`${fmt.ils(o.minOrderIls)} – ${fmt.ils(o.maxOrderIls)}`} />
        <Row k={t("market.payment")} v={t(`enums.pm_${o.paymentMethod}`)} />
        {o.terms ? <T v="muted">{o.terms}</T> : null}
      </Card>
      <Notice text={t("how.safety1")} />
      {o.isMine ? <Notice text={t("offer.ownOffer")} /> : !me?.ineligibility.length ? (
        <Card>
          {error && <Notice tone="danger" text={error} />}
          <Input label={`${buying ? t("offer.youPay") : t("offer.youReceive")} (₪)`} value={ils} onChangeText={(v) => setIls(v.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" ltr error={ils && !ok ? t("errors.ORDER_OUTSIDE_LIMITS") : undefined} />
          <Row k={t("trade.amount")} v={amount ? `${fmt.usdt(formatUsdt(amount))} USDT` : "—"} />
          <Row k={t("trade.total")} v={fiat ? fmt.ils(formatIls(fiat)) : "—"} strong />
          <Row k={t("offer.fee", { rate: quote.data ? quote.data.fee.rateBps / 100 : "…" })} v={quote.data ? `${quote.data.fee.feeUsdt} USDT` : "—"} />
          <Row k={buying ? t("offer.youReceive") : t("trade.lock")} v={quote.data ? `${fmt.usdt(buying ? quote.data.buyerReceivesUsdt : quote.data.sellerLocksUsdt)} USDT` : "—"} strong />
          {!buying && !bank && <Notice tone="warning" text={t("errors.BANK_ACCOUNT_REQUIRED")} />}
          <Check label={t("offer.acceptFees")} value={accepted} onChange={setAccepted} />
          <Button title={t("offer.placeOrder")} variant={buying ? "primary" : "danger"} disabled={!quote.data || !accepted || (!buying && !bank)} loading={busy} onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              const trade = await post<TradeDto>("/trades", { offerId: o.id, amountUsdt: formatUsdt(amount!), quotedPriceIls: o.priceIls, quotedVersion: o.version, acceptFees: true, ...(buying ? {} : { bankAccountId: bank!.id }) }, key);
              qc.invalidateQueries({ queryKey: ["trades"] });
              router.replace(`/trade/${trade.id}`);
            } catch (e) {
              if (e instanceof ApiError && e.code === "OFFER_CHANGED") { setKey(newKey()); await offerQ.refetch(); }
              setError(err(e));
            } finally {
              setBusy(false);
            }
          }} />
        </Card>
      ) : (
        <Button title={t("offer.verifyToTrade")} variant="outline" onPress={() => router.push("/verify")} />
      )}
    </Screen>
  );
}
