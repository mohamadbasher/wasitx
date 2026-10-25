"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, RefreshCw, Unlock } from "lucide-react";
import { useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, Input, Modal, Textarea, useToast } from "@wasitx/ui";
import { errorText, get, post } from "@/lib/api";
import { DataTable, H1, useStaffMe, when } from "@/components/shell";

type Gates = { tradingMode: string; allSatisfied: boolean; gates: Record<string, { value: boolean; evidence?: string; at?: string }> };
type Recon = { ranAt: string; ok: boolean; ledgerLiabilitiesUsdt: string; omnibusUsdt: string; custodianAssetsUsdt: string; exceptions: { kind: string; ref: string; ledger: string; custodian: string }[] } | null;

const GATE_LABEL: Record<string, string> = {
  "gate.licence.confirmed": "Licence (or legal opinion) on file",
  "gate.aml.program.approved": "AML programme approved, officer appointed",
  "gate.custody.contract.signed": "Custodian contract signed, production API issued",
  "gate.kyc.provider.contracted": "KYC & screening provider contracted",
  "gate.banking.confirmed": "Company banking & fiat-flow model confirmed",
  "gate.privacy.dpo.appointed": "DPO appointed, privacy notice approved",
  "gate.terms.published": "Terms, risk disclosure, fee schedule approved",
  "gate.pentest.passed": "Independent penetration test passed",
};

export default function SettingsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useStaffMe().data;
  const gates = useQuery({ queryKey: ["gates"], queryFn: () => get<Gates>("/admin/settings/gates") });
  const recon = useQuery({ queryKey: ["recon"], queryFn: () => get<Recon>("/admin/reconciliation/last") });
  const [gate, setGate] = useState<{ key: string; value: boolean } | null>(null);
  const [evidence, setEvidence] = useState("");
  const [csv, setCsv] = useState("");
  const [running, setRunning] = useState(false);
  const canGates = me?.permissions.includes("gates:manage");
  return (
    <>
      <H1 sub="Production mode refuses to start until every gate is recorded and no sandbox adapter is configured.">Settings & production gates</H1>
      <Card className="mb-5">
        <CardHeader title="Production gates" subtitle={`Current mode: ${gates.data?.tradingMode ?? "…"}`} action={gates.data && <Badge tone={gates.data.allSatisfied ? "success" : "warning"}>{gates.data.allSatisfied ? "ALL GATES SET" : "NOT READY FOR PRODUCTION"}</Badge>} />
        <ul className="divide-y divide-border">
          {gates.data && Object.entries(gates.data.gates).map(([k, g]) => (
            <li key={k} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="flex items-center gap-3">
                {g.value ? <Unlock className="size-4 text-success" /> : <Lock className="size-4 text-warning" />}
                <div>
                  <p className="text-sm font-medium">{GATE_LABEL[k] ?? k}</p>
                  <p className="text-xs text-muted">{g.evidence ? `${g.evidence} · ${when(g.at)}` : "No evidence recorded"}</p>
                </div>
              </div>
              {canGates && <Button size="sm" variant="outline" onClick={() => { setGate({ key: k, value: !g.value }); setEvidence(""); }}>{g.value ? "Unset" : "Record"}</Button>}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mb-5">
        <CardHeader title="Ledger ↔ custodian reconciliation" subtitle="Runs automatically every 10 minutes." action={
          <Button size="sm" variant="outline" loading={running} onClick={async () => { setRunning(true); try { await post("/admin/reconciliation/run"); qc.invalidateQueries({ queryKey: ["recon"] }); } catch (e) { toast("danger", errorText(e)); } finally { setRunning(false); } }}><RefreshCw className="size-4" />Run now</Button>
        } />
        {recon.data ? (
          <div className="p-5">
            <Alert tone={recon.data.ok ? "success" : "danger"} title={recon.data.ok ? "No exceptions" : `${recon.data.exceptions.length} exception(s)`}>
              Ran {when(recon.data.ranAt)} · ledger liabilities {recon.data.ledgerLiabilitiesUsdt} USDT · custodian assets {recon.data.custodianAssetsUsdt} USDT · omnibus {recon.data.omnibusUsdt}
            </Alert>
            {recon.data.exceptions.length > 0 && <DataTable rows={recon.data.exceptions} cols={[{ h: "Kind", c: (x) => x.kind }, { h: "Ref", c: (x) => <code className="text-xs">{x.ref}</code> }, { h: "Ledger", c: (x) => x.ledger }, { h: "Custodian", c: (x) => x.custodian }]} />}
          </div>
        ) : <p className="p-5 text-sm text-muted">Not run yet.</p>}
      </Card>

      <Card>
        <CardHeader title="Bank statement import (sandbox reconciliation)" subtitle="CSV: date,amount,reference,payer_name — matched to payments by WX reference + exact amount. Production uses a licensed open-banking feed." />
        <div className="space-y-3 p-5">
          <Textarea rows={5} className="font-mono text-xs" placeholder={"2026-10-25,740.00,WXAB12CD,Dana Levi"} value={csv} onChange={(e) => setCsv(e.target.value)} />
          <Button disabled={!csv.trim()} onClick={async () => {
            try { const r = await post<{ imported: number; matched: number }>("/admin/reconciliation/statement", { csv }); toast("success", `Imported ${r.imported}, matched ${r.matched}`); setCsv(""); } catch (e) { toast("danger", errorText(e)); }
          }}>Import</Button>
        </div>
      </Card>

      <Modal open={!!gate} onClose={() => setGate(null)} title={`${gate?.value ? "Record" : "Unset"} gate`} footer={
        <Button disabled={evidence.length < 5} onClick={async () => {
          try { await post("/admin/settings/gates", { gate: gate!.key, value: gate!.value, evidence }); setGate(null); qc.invalidateQueries({ queryKey: ["gates"] }); } catch (e) { toast("danger", errorText(e)); }
        }}>Confirm</Button>
      }>
        <div className="space-y-3">
          <p className="text-sm">{GATE_LABEL[gate?.key ?? ""]}</p>
          <Input placeholder="Evidence (document reference, date, approver)" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
          <p className="text-xs text-muted">Recorded with your identity in the audit log. Setting gates does not by itself enable production — the API must also be redeployed with real provider adapters.</p>
        </div>
      </Modal>
    </>
  );
}
