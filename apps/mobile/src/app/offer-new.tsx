import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { Button, Input, Notice, Screen, Segmented } from "@/components/ui";
import { get, post } from "@/lib/api";
import { useErrorText } from "@/lib/i18n";

type Bank = { id: string; status: string };

export default function NewOffer() {
  const t = useTranslations();
  const err = useErrorText();
  const qc = useQueryClient();
  const banks = useQuery({ queryKey: ["banks"], queryFn: () => get<Bank[]>("/bank-accounts") });
  const [side, setSide] = useState<"SELL" | "BUY">("SELL");
  const [f, setF] = useState({ amountUsdt: "", priceIls: "", minOrderIls: "100", maxOrderIls: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bank = banks.data?.find((b) => b.status === "VERIFIED");
  return (
    <Screen>
      <Segmented value={side} onChange={setSide} items={[{ value: "SELL", label: t("offer.sideSell") }, { value: "BUY", label: t("offer.sideBuy") }]} />
      {error && <Notice tone="danger" text={error} />}
      <Input label={t("offer.totalAmount")} value={f.amountUsdt} onChangeText={(v) => setF({ ...f, amountUsdt: v })} keyboardType="decimal-pad" ltr />
      <Input label={t("offer.pricePerUsdt")} value={f.priceIls} onChangeText={(v) => setF({ ...f, priceIls: v })} keyboardType="decimal-pad" placeholder="3.70" ltr />
      <Input label={t("offer.minOrder")} value={f.minOrderIls} onChangeText={(v) => setF({ ...f, minOrderIls: v })} keyboardType="decimal-pad" ltr />
      <Input label={t("offer.maxOrder")} value={f.maxOrderIls} onChangeText={(v) => setF({ ...f, maxOrderIls: v })} keyboardType="decimal-pad" ltr />
      {side === "SELL" && !bank && <Notice tone="warning" text={t("errors.BANK_ACCOUNT_REQUIRED")} />}
      {side === "SELL" && f.amountUsdt ? <Notice text={t("offer.reserveNote", { amount: f.amountUsdt })} /> : null}
      <Button title={t("offer.publish")} loading={busy} disabled={side === "SELL" && !bank} onPress={async () => {
        setBusy(true);
        setError(null);
        try {
          await post("/offers", { side, ...f, paymentMethod: "IL_BANK_TRANSFER", expiresInHours: 168, ...(side === "SELL" ? { bankAccountId: bank!.id } : {}) });
          qc.invalidateQueries({ queryKey: ["offers"] });
          router.back();
        } catch (e) { setError(err(e)); } finally { setBusy(false); }
      }} />
    </Screen>
  );
}
