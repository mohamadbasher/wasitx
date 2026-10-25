"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, Input, Modal, useToast } from "@wasitx/ui";
import { errorText, get, post } from "@/lib/api";
import { DataTable, H1, useStaffMe } from "@/components/shell";

type PM = { code: string; enabled: boolean; note: string | null };
type Net = { code: string; enabled: boolean; label: string; tokenContract: string | null; minConfirmations: number; withdrawalFeeUsdt: string; minWithdrawalUsdt: string; note: string | null };

export default function PaymentsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useStaffMe().data;
  const pms = useQuery({ queryKey: ["pms"], queryFn: () => get<PM[]>("/admin/payment-methods") });
  const nets = useQuery({ queryKey: ["nets"], queryFn: () => get<Net[]>("/admin/networks") });
  const [target, setTarget] = useState<{ kind: "pm" | "net"; code: string; enable: boolean } | null>(null);
  const [note, setNote] = useState("");
  const canPm = me?.permissions.includes("payment_methods:manage");
  const canNet = me?.permissions.includes("networks:manage");
  return (
    <>
      <H1 sub="Enable a method or network only after its commercial terms, custodian support and contract addresses are verified.">Payments & networks</H1>
      <Card className="mb-5 overflow-hidden">
        <CardHeader title="Payment methods" subtitle="Bit / PayBox require a note confirming provider terms permit crypto-related transfers." />
        <DataTable rows={pms.data} cols={[
          { h: "Method", c: (m) => m.code },
          { h: "Status", c: (m) => <Badge tone={m.enabled ? "success" : "neutral"}>{m.enabled ? "ENABLED" : "DISABLED"}</Badge> },
          { h: "Note", c: (m) => <span className="text-xs text-muted">{m.note}</span> },
          { h: "", c: (m) => canPm && <Button size="sm" variant="outline" onClick={() => { setTarget({ kind: "pm", code: m.code, enable: !m.enabled }); setNote(""); }}>{m.enabled ? "Disable" : "Enable"}</Button> },
        ]} />
      </Card>
      <Card className="overflow-hidden">
        <CardHeader title="USDT networks" />
        <DataTable rows={nets.data} cols={[
          { h: "Network", c: (n) => n.label },
          { h: "Status", c: (n) => <Badge tone={n.enabled ? "success" : "neutral"}>{n.enabled ? "ENABLED" : "DISABLED"}</Badge> },
          { h: "Token contract", c: (n) => <code className="text-xs">{n.tokenContract ?? "—"}</code> },
          { h: "Confirmations", c: (n) => n.minConfirmations },
          { h: "Withdrawal fee / min", c: (n) => `${n.withdrawalFeeUsdt} / ${n.minWithdrawalUsdt} USDT` },
          { h: "Note", c: (n) => <span className="text-xs text-muted">{n.note}</span> },
          { h: "", c: (n) => canNet && <Button size="sm" variant="outline" onClick={() => { setTarget({ kind: "net", code: n.code, enable: !n.enabled }); setNote(""); }}>{n.enabled ? "Disable" : "Enable"}</Button> },
        ]} />
      </Card>
      <Modal open={!!target} onClose={() => setTarget(null)} title={`${target?.enable ? "Enable" : "Disable"} ${target?.code}`} footer={
        <Button disabled={note.length < 3} onClick={async () => {
          try {
            await post(`/admin/${target!.kind === "pm" ? "payment-methods" : "networks"}/${target!.code}`, { enabled: target!.enable, note });
            setTarget(null);
            qc.invalidateQueries({ queryKey: [target!.kind === "pm" ? "pms" : "nets"] });
          } catch (e) { toast("danger", errorText(e)); }
        }}>Confirm</Button>
      }>
        <div className="space-y-3">
          {target?.enable && <Alert tone="warning">Record the evidence: provider terms / custodian confirmation / verified contract address.</Alert>}
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (audited)" />
        </div>
      </Modal>
    </>
  );
}
