"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Alert, Button, Card, Field, Input, Select, Tabs, Textarea } from "@wasitx/ui";
import { fiatForUsdt, formatIls, parsePrice, parseUsdt, type BalanceDto, type OfferDto } from "@wasitx/shared";
import { Num } from "@/components/app";
import { Link, useRouter } from "@/i18n/navigation";
import { get, patch, post } from "@/lib/api";
import { useErrorText, useFmt, usePublicConfig } from "@/lib/hooks";

type Bank = { id: string; bankName: Record<string, string>; branchNumber: string; accountMasked: string; status: string };
const DURATIONS = [6, 24, 72, 168, 720];

export function OfferForm({ existing }: { existing?: OfferDto }) {
  const t = useTranslations();
  const locale = useLocale();
  const f = useFmt();
  const err = useErrorText();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: config } = usePublicConfig();
  const banks = useQuery({ queryKey: ["banks"], queryFn: () => get<Bank[]>("/bank-accounts") });
  const balances = useQuery({ queryKey: ["balances"], queryFn: () => get<BalanceDto>("/wallet/balances") });

  const [side, setSide] = useState<"SELL" | "BUY">(existing?.side ?? "SELL");
  const [form, setForm] = useState({
    amountUsdt: existing?.amountUsdt ?? "",
    priceIls: existing?.priceIls ?? "",
    minOrderIls: existing?.minOrderIls ?? "100",
    maxOrderIls: existing?.maxOrderIls ?? "",
    paymentMethod: existing?.paymentMethod ?? "IL_BANK_TRANSFER",
    bankAccountId: "",
    expiresInHours: 168,
    terms: existing?.terms ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  const verifiedBanks = banks.data?.filter((b) => b.status === "VERIFIED") ?? [];
  const total = (() => {
    try {
      return formatIls(fiatForUsdt(parseUsdt(form.amountUsdt), parsePrice(form.priceIls)));
    } catch {
      return null;
    }
  })();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (existing) {
        await patch(`/offers/${existing.id}`, {
          amountUsdt: form.amountUsdt,
          priceIls: form.priceIls,
          minOrderIls: form.minOrderIls,
          maxOrderIls: form.maxOrderIls,
          terms: form.terms || undefined,
          ...(form.bankAccountId ? { bankAccountId: form.bankAccountId } : {}),
          version: existing.version,
        });
      } else {
        await post("/offers", {
          side,
          amountUsdt: form.amountUsdt,
          priceIls: form.priceIls,
          minOrderIls: form.minOrderIls,
          maxOrderIls: form.maxOrderIls,
          paymentMethod: form.paymentMethod,
          expiresInHours: Number(form.expiresInHours),
          terms: form.terms || undefined,
          ...(side === "SELL" ? { bankAccountId: form.bankAccountId || verifiedBanks[0]?.id } : {}),
        });
      }
      qc.invalidateQueries({ queryKey: ["my-offers"] });
      qc.invalidateQueries({ queryKey: ["balances"] });
      router.push("/my-offers");
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="space-y-5">
        {error && <Alert tone="danger">{error}</Alert>}
        {!existing && (
          <Field label={t("offer.side")}>
            <Tabs value={side} onChange={setSide} items={[{ value: "SELL", label: t("offer.sideSell") }, { value: "BUY", label: t("offer.sideBuy") }]} />
          </Field>
        )}
        {side === "SELL" && balances.data && (
          <p className="text-sm text-muted">
            {t("wallet.available")}: <Num className="font-semibold text-fg">{f.usdt(balances.data.available)} USDT</Num>{" "}
            <Link href="/wallet" className="text-accent-strong hover:underline">{t("wallet.deposit")}</Link>
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("offer.totalAmount")}><Input inputMode="decimal" dir="ltr" value={form.amountUsdt} onChange={set("amountUsdt")} /></Field>
          <Field label={t("offer.pricePerUsdt")} hint={total ? `${t("trade.total")}: ${f.ils(total)}` : undefined}><Input inputMode="decimal" dir="ltr" value={form.priceIls} onChange={set("priceIls")} placeholder="3.70" /></Field>
          <Field label={t("offer.minOrder")}><Input inputMode="decimal" dir="ltr" value={form.minOrderIls} onChange={set("minOrderIls")} /></Field>
          <Field label={t("offer.maxOrder")} hint={config ? `≤ ${f.ils(config.limits.maxTradeIls)}` : undefined}><Input inputMode="decimal" dir="ltr" value={form.maxOrderIls} onChange={set("maxOrderIls")} /></Field>
          {!existing && (
            <Field label={t("offer.paymentMethod")}>
              <Select value={form.paymentMethod} onChange={set("paymentMethod")}>
                {config?.paymentMethods.filter((m) => m.enabled).map((m) => <option key={m.code} value={m.code}>{t(`enums.pm_${m.code}`)}</option>)}
              </Select>
            </Field>
          )}
          {!existing && (
            <Field label={t("offer.expiresIn")}>
              <Select value={form.expiresInHours} onChange={set("expiresInHours")}>
                {DURATIONS.map((h) => <option key={h} value={h}>{h >= 24 ? t("offer.days", { count: h / 24 }) : t("offer.hours", { count: h })}</option>)}
              </Select>
            </Field>
          )}
          {side === "SELL" && (
            <Field label={t("offer.bankAccount")} className="sm:col-span-2">
              {verifiedBanks.length ? (
                <Select value={form.bankAccountId || verifiedBanks[0]!.id} onChange={set("bankAccountId")}>
                  {verifiedBanks.map((b) => <option key={b.id} value={b.id}>{b.bankName[locale] ?? b.bankName.en} · {b.branchNumber} · {b.accountMasked}</option>)}
                </Select>
              ) : (
                <Alert tone="warning"><Link href="/bank-accounts" className="font-semibold text-accent-strong hover:underline">{t("bank.add")}</Link></Alert>
              )}
            </Field>
          )}
        </div>
        <Field label={t("offer.termsField")} hint={t("offer.termsHint")}><Textarea value={form.terms} onChange={set("terms")} maxLength={500} /></Field>
        {side === "SELL" && form.amountUsdt && !existing && <Alert tone="info">{t("offer.reserveNote", { amount: form.amountUsdt })}</Alert>}
        <Button type="submit" size="lg" loading={busy} disabled={side === "SELL" && !verifiedBanks.length}>{existing ? t("common.save") : t("offer.publish")}</Button>
      </form>
    </Card>
  );
}
