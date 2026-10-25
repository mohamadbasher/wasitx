import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { ISRAELI_BANKS, bankAccountSchema } from "@wasitx/shared";
import { Badge, Button, Card, Input, Notice, Screen, Segmented, T } from "@/components/ui";
import { get, post } from "@/lib/api";
import { useErrorText, useLocale } from "@/lib/i18n";

type Bank = { id: string; bankName: Record<string, string>; branchNumber: string; accountMasked: string; holderName: string; status: string };

export default function BankAccounts() {
  const t = useTranslations();
  const err = useErrorText();
  const { locale } = useLocale();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["banks"], queryFn: () => get<Bank[]>("/bank-accounts") });
  const [f, setF] = useState({ bankCode: "12", branchNumber: "", accountNumber: "", holderName: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const top = ISRAELI_BANKS.slice(0, 4);
  return (
    <Screen>
      <T v="muted">{t("bank.subtitle")}</T>
      {q.data?.map((b) => (
        <Card key={b.id}>
          <T v="label">{b.bankName[locale] ?? b.bankName.en}</T>
          <T v="num">{b.branchNumber} · {b.accountMasked}</T>
          <T v="muted">{b.holderName}</T>
          <Badge text={t(`bank.status_${b.status}` as never)} tone={b.status === "VERIFIED" ? "success" : b.status === "REJECTED" ? "danger" : "warning"} />
        </Card>
      ))}
      <Card>
        <T v="h2">{t("bank.add")}</T>
        {error && <Notice tone="danger" text={error} />}
        <Segmented value={f.bankCode} onChange={(v) => setF({ ...f, bankCode: v })} items={top.map((b) => ({ value: b.code, label: b.name[locale].split(" ").slice(-1)[0]! }))} />
        <Input label={t("bank.branch")} value={f.branchNumber} onChangeText={(v) => setF({ ...f, branchNumber: v.replace(/\D/g, "") })} keyboardType="number-pad" maxLength={3} ltr />
        <Input label={t("bank.account")} value={f.accountNumber} onChangeText={(v) => setF({ ...f, accountNumber: v.replace(/\D/g, "") })} keyboardType="number-pad" maxLength={13} ltr />
        <Input label={t("bank.holder")} hint={t("bank.holderHint")} value={f.holderName} onChangeText={(v) => setF({ ...f, holderName: v })} />
        <Button title={t("common.save")} loading={busy} disabled={!bankAccountSchema.safeParse(f).success} onPress={async () => {
          setBusy(true);
          setError(null);
          try { await post("/bank-accounts", f); setF({ ...f, branchNumber: "", accountNumber: "", holderName: "" }); } catch (e) { setError(err(e)); } finally { setBusy(false); qc.invalidateQueries({ queryKey: ["banks"] }); }
        }} />
      </Card>
    </Screen>
  );
}
