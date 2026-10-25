"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, FlaskConical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, CopyButton, Field, Input, KeyValue, Modal, Select, Skeleton, Stat, Tabs, useToast } from "@wasitx/ui";
import { detectAddressNetwork, type BalanceDto, type NetworkCode } from "@wasitx/shared";
import { Container, Num, PageHeader, RequireAuth } from "@/components/app";
import { Link } from "@/i18n/navigation";
import { get, newIdempotencyKey, post } from "@/lib/api";
import { useErrorText, useFmt, usePublicConfig } from "@/lib/hooks";

type History = {
  deposits: { id: string; network: string; amountUsdt: string; txHash: string; status: string; simulated: boolean; createdAt: string }[];
  withdrawals: { id: string; network: string; amountUsdt: string; address: string; status: string; txHash: string | null; simulated: boolean; createdAt: string }[];
};
type LedgerPage = { items: { id: string; account: string; amountUsdt: string; type: string; description: string; createdAt: string }[]; nextCursor: string | null };

export default function WalletPage() {
  const t = useTranslations();
  const f = useFmt();
  const err = useErrorText();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: config } = usePublicConfig();
  const networks = config?.networks.filter((n) => n.enabled) ?? [];
  const bal = useQuery({ queryKey: ["balances"], queryFn: () => get<BalanceDto>("/wallet/balances") });
  const history = useQuery({ queryKey: ["wallet-history"], queryFn: () => get<History>("/wallet/history") });
  const ledger = useQuery({ queryKey: ["ledger"], queryFn: () => get<LedgerPage>("/wallet/ledger") });
  const [network, setNetwork] = useState<NetworkCode>("TRON_TRC20");
  const [modal, setModal] = useState<null | "deposit" | "withdraw">(null);
  const [tab, setTab] = useState<"deposits" | "withdrawals" | "ledger">("deposits");
  const addr = useQuery({ queryKey: ["deposit-address", network], queryFn: () => get<{ address: string; label: string; tokenContract: string | null; minConfirmations: number; sandbox: boolean }>(`/wallet/deposit-address?network=${network}`), enabled: modal === "deposit" && networks.length > 0 });
  const [amount, setAmount] = useState("");
  const [dest, setDest] = useState("");
  const [mfa, setMfa] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => ["balances", "wallet-history", "ledger", "dashboard"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const detected = dest ? detectAddressNetwork(dest) : null;
  const sandbox = bal.data?.source === "SANDBOX_CUSTODY";

  return (
    <RequireAuth>
      {(me) => (
        <Container>
          <PageHeader
            title={t("wallet.title")}
            action={
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setModal("deposit")} disabled={!networks.length}><ArrowDownToLine className="size-4" />{t("wallet.deposit")}</Button>
                <Button variant="outline" onClick={() => setModal("withdraw")} disabled={!networks.length}><ArrowUpFromLine className="size-4" />{t("wallet.withdraw")}</Button>
              </div>
            }
          />
          {bal.data && (
            <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">{t("wallet.source")}:</span>
              <Badge tone={sandbox ? "warning" : "info"}>{sandbox ? <><FlaskConical className="size-3" />{t("wallet.sandboxSource")}</> : bal.data.sourceLabel}</Badge>
              <Badge tone={bal.data.reconciled ? "success" : "danger"}>{bal.data.reconciled ? <><CheckCircle2 className="size-3" />{t("wallet.reconciled")}</> : <><AlertTriangle className="size-3" />{t("wallet.notReconciled")}</>}</Badge>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {bal.data ? (
              <>
                <Stat label={t("wallet.available")} value={<Num>{f.usdt(bal.data.available)}</Num>} hint="USDT" className="col-span-2 lg:col-span-1" />
                <Stat label={t("wallet.reserved")} value={<Num>{f.usdt(bal.data.reservedInOffers)}</Num>} hint="USDT" />
                <Stat label={t("wallet.escrow")} value={<Num>{f.usdt(bal.data.inEscrow)}</Num>} hint="USDT" />
                <Stat label={t("wallet.pendingWithdrawal")} value={<Num>{f.usdt(bal.data.pendingWithdrawal)}</Num>} hint="USDT" />
                <Stat label={t("wallet.custodian")} value={<Num>{f.usdt(bal.data.custodianBalance)}</Num>} hint={f.dateTime(bal.data.asOf)} />
              </>
            ) : (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)
            )}
          </div>
          {!networks.length && config && <Alert tone="info" className="mt-5">{t("wallet.noNetworks")}</Alert>}

          <Card className="mt-8 overflow-hidden">
            <div className="border-b border-border p-4"><Tabs size="sm" value={tab} onChange={setTab} items={[{ value: "deposits", label: t("wallet.deposits") }, { value: "withdrawals", label: t("wallet.withdrawals") }, { value: "ledger", label: t("wallet.ledger") }]} /></div>
            <ul className="divide-y divide-border text-sm">
              {tab === "deposits" && history.data?.deposits.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <span className="text-fg">+<Num>{f.usdt(d.amountUsdt)}</Num> USDT · {t(`enums.net_${d.network}` as never)}</span>
                  <span className="truncate font-mono text-xs text-muted" dir="ltr">{d.txHash.slice(0, 26)}…</span>
                  <span className="flex items-center gap-2">{d.simulated && <Badge tone="warning">{t("common.simulated")}</Badge>}<Badge tone="success">{d.status}</Badge><span className="num text-xs text-subtle">{f.dateTime(d.createdAt)}</span></span>
                </li>
              ))}
              {tab === "withdrawals" && history.data?.withdrawals.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <span className="text-fg">−<Num>{f.usdt(w.amountUsdt)}</Num> USDT</span>
                  <span className="truncate font-mono text-xs text-muted" dir="ltr">{w.address.slice(0, 18)}…</span>
                  <span className="flex items-center gap-2">{w.simulated && <Badge tone="warning">{t("common.simulated")}</Badge>}<Badge tone={w.status === "CONFIRMED" ? "success" : w.status === "REJECTED" ? "danger" : "warning"}>{w.status}</Badge></span>
                </li>
              ))}
              {tab === "ledger" && ledger.data?.items.map((l) => (
                <li key={l.id} className="grid grid-cols-[1fr_auto] gap-2 px-5 py-3 sm:grid-cols-[1fr_180px_140px_auto]">
                  <span className="text-fg">{l.description}</span>
                  <span className="hidden text-xs text-muted sm:block">{l.account.replace("USER_", "")}</span>
                  <span className={`num text-end font-mono ${l.amountUsdt.startsWith("-") ? "text-danger" : "text-success"}`}>{l.amountUsdt.startsWith("-") ? "" : "+"}{l.amountUsdt}</span>
                  <span className="num hidden text-xs text-subtle sm:block">{f.dateTime(l.createdAt)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Modal open={modal === "deposit"} onClose={() => setModal(null)} title={t("wallet.deposit")}>
            <div className="space-y-4">
              <Field label={t("wallet.network")}>
                <Select value={network} onChange={(e) => setNetwork(e.target.value as NetworkCode)}>{networks.map((n) => <option key={n.code} value={n.code}>{n.label}</option>)}</Select>
              </Field>
              {addr.data ? (
                <div className="rounded-lg bg-surface-2 p-4">
                  <p className="text-xs text-muted">{t("wallet.address")}</p>
                  <p className="mt-1 break-all font-mono text-sm text-fg" dir="ltr">{addr.data.address}</p>
                  <CopyButton className="mt-2" value={addr.data.address} label={t("common.copy")} copiedLabel={t("common.copied")} />
                </div>
              ) : <Skeleton className="h-20" />}
              <Alert tone="warning">{t("wallet.addressWarning", { network: networks.find((n) => n.code === network)?.label ?? network })}</Alert>
              {sandbox && (
                <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
                  <p className="font-semibold text-warning">{t("wallet.sandboxDeposit")}</p>
                  <p className="mt-1 text-sm text-muted">{t("wallet.sandboxDepositBody")}</p>
                  <div className="mt-3 flex gap-2">
                    <Input inputMode="decimal" dir="ltr" placeholder="1000" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
                    <Button loading={busy} disabled={!amount} onClick={async () => {
                      setBusy(true);
                      try {
                        await post("/wallet/sandbox/deposit", { network, amountUsdt: amount }, newIdempotencyKey());
                        setAmount("");
                        setModal(null);
                        refresh();
                      } catch (e) {
                        toast("danger", err(e));
                      } finally {
                        setBusy(false);
                      }
                    }}>{t("wallet.deposit")}</Button>
                  </div>
                </div>
              )}
            </div>
          </Modal>

          <Modal open={modal === "withdraw"} onClose={() => setModal(null)} title={t("wallet.withdraw")} footer={me.mfaEnabled ? (
            <Button loading={busy} disabled={!amount || !dest || mfa.length !== 6 || (!!detected && detected !== network)} onClick={async () => {
              setBusy(true);
              try {
                await post("/wallet/withdrawals", { network, address: dest, amountUsdt: amount, mfaCode: mfa }, newIdempotencyKey());
                setModal(null);
                setAmount("");
                setDest("");
                setMfa("");
                refresh();
              } catch (e) {
                toast("danger", err(e));
              } finally {
                setBusy(false);
              }
            }}>{t("wallet.withdraw")}</Button>
          ) : undefined}>
            {!me.mfaEnabled ? (
              <Alert tone="warning" title={t("wallet.withdrawNeedsMfa")}><Link href="/security" className="font-semibold text-accent-strong hover:underline">{t("nav.security")}</Link></Alert>
            ) : (
              <div className="space-y-4">
                <Field label={t("wallet.network")}>
                  <Select value={network} onChange={(e) => setNetwork(e.target.value as NetworkCode)}>{networks.map((n) => <option key={n.code} value={n.code}>{n.label}</option>)}</Select>
                </Field>
                <Field label={t("wallet.destination")} error={detected && detected !== network ? t("errors.WRONG_NETWORK_ADDRESS") : undefined}>
                  <Input dir="ltr" className="font-mono" value={dest} onChange={(e) => setDest(e.target.value.trim())} />
                </Field>
                <Field label={t("wallet.amount")}><Input inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} /></Field>
                <Field label={t("wallet.mfaCode")}><Input inputMode="numeric" maxLength={6} dir="ltr" className="font-mono tracking-widest" value={mfa} onChange={(e) => setMfa(e.target.value.replace(/\D/g, ""))} /></Field>
                <KeyValue items={[{ k: t("wallet.network"), v: networks.find((n) => n.code === network)?.label ?? "" }]} />
              </div>
            )}
          </Modal>
        </Container>
      )}
    </RequireAuth>
  );
}
