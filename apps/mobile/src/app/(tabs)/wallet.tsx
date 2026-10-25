import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { RefreshControl } from "react-native";
import { useTranslations } from "use-intl";
import type { BalanceDto, PublicConfigDto } from "@wasitx/shared";
import { Badge, Button, Card, Input, Loading, Notice, Row, Screen, T } from "@/components/ui";
import { get, newKey, post } from "@/lib/api";
import { fmt, useErrorText } from "@/lib/i18n";

export default function WalletTab() {
  const t = useTranslations();
  const err = useErrorText();
  const qc = useQueryClient();
  const bal = useQuery({ queryKey: ["balances"], queryFn: () => get<BalanceDto>("/wallet/balances") });
  const config = useQuery({ queryKey: ["config"], queryFn: () => get<PublicConfigDto>("/config/public") });
  const network = config.data?.networks.find((n) => n.enabled);
  const addr = useQuery({ queryKey: ["deposit-address", network?.code], queryFn: () => get<{ address: string }>(`/wallet/deposit-address?network=${network!.code}`), enabled: !!network });
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const b = bal.data;
  const sandbox = b?.source === "SANDBOX_CUSTODY";

  return (
    <Screen>
      {!b ? <Loading /> : (
        <>
          <Card>
            <Badge text={sandbox ? t("wallet.sandboxSource") : b.sourceLabel} tone={sandbox ? "warning" : "info"} />
            <Badge text={b.reconciled ? t("wallet.reconciled") : t("wallet.notReconciled")} tone={b.reconciled ? "success" : "danger"} />
            <T v="muted">{t("wallet.available")}</T>
            <T v="num" style={{ fontSize: 32, fontWeight: "700" }}>{fmt.usdt(b.available)} USDT</T>
            <Row k={t("wallet.reserved")} v={`${fmt.usdt(b.reservedInOffers)} USDT`} />
            <Row k={t("wallet.escrow")} v={`${fmt.usdt(b.inEscrow)} USDT`} />
            <Row k={t("wallet.pendingWithdrawal")} v={`${fmt.usdt(b.pendingWithdrawal)} USDT`} />
            <Row k={t("wallet.custodian")} v={`${fmt.usdt(b.custodianBalance)} USDT`} />
          </Card>
          {network && addr.data && (
            <Card>
              <T v="h2">{t("wallet.deposit")} · {network.label}</T>
              <T v="num" style={{ fontSize: 13 }}>{addr.data.address}</T>
              <Button title={t("common.copy")} variant="outline" onPress={() => Clipboard.setStringAsync(addr.data!.address)} />
              <Notice tone="warning" text={t("wallet.addressWarning", { network: network.label })} />
            </Card>
          )}
          {sandbox && network && (
            <Card>
              <T v="h2">{t("wallet.sandboxDeposit")}</T>
              <T v="muted">{t("wallet.sandboxDepositBody")}</T>
              {error && <Notice tone="danger" text={error} />}
              <Input label={t("wallet.amount")} value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" ltr />
              <Button title={t("wallet.deposit")} loading={busy} disabled={!amount} onPress={async () => {
                setBusy(true);
                setError(null);
                try {
                  await post("/wallet/sandbox/deposit", { network: network.code, amountUsdt: amount }, newKey());
                  setAmount("");
                  qc.invalidateQueries({ queryKey: ["balances"] });
                } catch (e) {
                  setError(err(e));
                } finally {
                  setBusy(false);
                }
              }} />
            </Card>
          )}
          <T v="small">{t("wallet.withdrawNeedsMfa")}</T>
        </>
      )}
    </Screen>
  );
}
