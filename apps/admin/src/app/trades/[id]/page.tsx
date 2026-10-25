"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use, useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, KeyValue, Modal, Skeleton, Textarea, useToast } from "@wasitx/ui";
import type { MessageDto, TradeDto } from "@wasitx/shared";
import { errorText, get, post } from "@/lib/api";
import { DataTable, H1, tone, useStaffMe, when } from "@/components/shell";

type Detail = {
  trade: TradeDto;
  escrowOps: { id: string; type: string; status: string; amountUsdt: string; attempts: number; providerRef: string | null; error: string | null; createdAt: string }[];
  riskFlags: { id: string; type: string; severity: string; resolvedAt: string | null }[];
  cases: { id: string; type: string; status: string; summary: string }[];
  payment: null | { status: string; reference: string; amountIls: string; buyerNote: string | null; reconciledAt: string | null };
};

type Action = { key: string; label: string; path: string; field: "reason" | "note"; danger?: boolean };

export default function TradeDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const toast = useToast();
  const me = useStaffMe().data;
  const q = useQuery({ queryKey: ["admin-trade", id], queryFn: () => get<Detail>(`/admin/trades/${id}`), refetchInterval: 10_000 });
  const chat = useQuery({ queryKey: ["admin-trade-chat", id], queryFn: () => get<MessageDto[]>(`/trades/${id}/messages`) });
  const [act, setAct] = useState<Action | null>(null);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const d = q.data;
  if (!d) return <Skeleton className="h-96" />;
  const t = d.trade;
  const can = (p: string) => me?.permissions.includes(p as never);
  const actions: Action[] = [];
  if (can("trades:compliance_approve") && (t.status === "COMPLIANCE_REVIEW" || t.status === "SELLER_CONFIRMED_RECEIPT")) {
    actions.push({ key: "approve", label: t.status === "COMPLIANCE_REVIEW" ? "Approve → escrow" : "Approve release", path: "compliance-approve", field: "note" });
  }
  if (can("trades:compliance_approve") && t.status === "COMPLIANCE_REVIEW") actions.push({ key: "reject", label: "Reject trade", path: "compliance-reject", field: "note", danger: true });
  if (can("trades:freeze") && !["COMPLETED", "CANCELLED", "EXPIRED", "FROZEN"].includes(t.status)) actions.push({ key: "freeze", label: "Freeze", path: "freeze", field: "reason", danger: true });
  if (can("trades:freeze") && t.status === "FROZEN") {
    actions.push({ key: "unfreeze", label: "Unfreeze", path: "unfreeze", field: "reason" });
    actions.push({ key: "cancel", label: "Request cancel + refund (4-eyes)", path: "cancel-frozen", field: "reason", danger: true });
  }

  return (
    <>
      <H1 sub={`${t.buyer.displayName} buys from ${t.seller.displayName}`} action={<div className="flex gap-2">{t.sandbox && <Badge tone="warning">SANDBOX</Badge>}<Badge tone={tone(t.status)}>{t.status}{t.frozenFrom ? ` (from ${t.frozenFrom})` : ""}</Badge></div>}>
        Trade <span className="font-mono">{t.reference}</span>
      </H1>
      {actions.length > 0 && <div className="mb-5 flex flex-wrap gap-2">{actions.map((a) => <Button key={a.key} variant={a.danger ? "danger" : "primary"} onClick={() => { setAct(a); setText(""); }}>{a.label}</Button>)}</div>}
      {t.disputeId && <Alert tone="danger" className="mb-5" title="This trade has a dispute"><Link className="underline" href={`/disputes/${t.disputeId}`}>Open dispute</Link></Alert>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Economics" />
          <div className="p-5">
            <KeyValue items={[
              { k: "Amount", v: `${t.amountUsdt} USDT` }, { k: "Price", v: `₪${t.priceIls}` }, { k: "Fiat", v: `₪${t.fiatAmountIls}`, strong: true },
              { k: "Fee", v: `${t.fee.feeUsdt} USDT (${t.fee.rateBps} bps, ${t.fee.payer})` }, { k: "Seller locks", v: `${t.sellerLocksUsdt} USDT` }, { k: "Buyer receives", v: `${t.buyerReceivesUsdt} USDT` },
              { k: "Payment", v: d.payment ? <span>{d.payment.status} · <span className="font-mono">{d.payment.reference}</span>{d.payment.reconciledAt ? " · reconciled" : ""}</span> : "—" },
              { k: "Buyer note", v: d.payment?.buyerNote ?? "—" },
            ]} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Timeline (append-only)" />
          <ol className="space-y-2 p-5 text-sm">{t.events?.map((e) => <li key={e.id} className="flex justify-between gap-3"><span><Badge tone={tone(e.toStatus)}>{e.toStatus}</Badge> <span className="text-muted">{e.action} · {e.actorRole}</span>{e.note && <span className="block text-xs text-muted">{e.note}</span>}</span><span className="text-xs text-subtle">{when(e.createdAt)}</span></li>)}</ol>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Custody instructions (escrow operations)" subtitle="Idempotent; retried with backoff; failures freeze the trade." />
          <DataTable rows={d.escrowOps} cols={[
            { h: "Type", c: (o) => o.type }, { h: "Status", c: (o) => <Badge tone={tone(o.status)}>{o.status}</Badge> }, { h: "Amount", c: (o) => `${o.amountUsdt} USDT` },
            { h: "Attempts", c: (o) => o.attempts }, { h: "Provider ref", c: (o) => <span className="font-mono text-xs">{o.providerRef ?? "—"}</span> }, { h: "Error", c: (o) => <span className="text-xs text-danger">{o.error}</span> }, { h: "Created", c: (o) => when(o.createdAt) },
          ]} />
        </Card>
        <Card>
          <CardHeader title="Risk flags & cases" />
          <div className="space-y-2 p-5 text-sm">
            {d.riskFlags.map((f) => <p key={f.id}><Badge tone={tone(f.severity)}>{f.severity}</Badge> {f.type} {f.resolvedAt && <span className="text-xs text-muted">(resolved)</span>}</p>)}
            {d.cases.map((c) => <p key={c.id}><Badge tone={tone(c.status)}>{c.status}</Badge> {c.type}: {c.summary}</p>)}
            {!d.riskFlags.length && !d.cases.length && <p className="text-muted">None</p>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Chat (staff sees unmasked text)" />
          <ul className="max-h-96 space-y-2 overflow-y-auto p-5 text-sm">
            {chat.data?.filter((m) => m.senderRole !== "system").map((m) => (
              <li key={m.id} className="rounded-md bg-surface-2 p-2">
                <span className="text-xs font-semibold text-muted">{m.senderRole} · {when(m.createdAt)}</span>
                {m.riskSignals.length > 0 && <span className="ms-2">{m.riskSignals.map((s) => <Badge key={s} tone="danger">{s}</Badge>)}</span>}
                <p className="whitespace-pre-wrap">{m.body}</p>
              </li>
            ))}
          </ul>
          {can("trades:chat_intervene") && (
            <form className="flex gap-2 border-t border-border p-3" onSubmit={async (e) => {
              e.preventDefault();
              try {
                await post(`/trades/${id}/messages`, { body: msg });
                setMsg("");
                qc.invalidateQueries({ queryKey: ["admin-trade-chat", id] });
              } catch (er) { toast("danger", errorText(er)); }
            }}>
              <Textarea rows={2} placeholder="Message both parties as Support (audited)" value={msg} onChange={(e) => setMsg(e.target.value)} />
              <Button type="submit" disabled={!msg.trim()}>Send</Button>
            </form>
          )}
        </Card>
      </div>
      <Modal open={!!act} onClose={() => setAct(null)} title={act?.label ?? ""} footer={
        <Button variant={act?.danger ? "danger" : "primary"} disabled={text.trim().length < 3} onClick={async () => {
          try {
            const r = await post<{ pendingApproval?: boolean }>(`/admin/trades/${id}/${act!.path}`, { [act!.field]: text });
            toast("success", r?.pendingApproval ? "Sent for second approval" : "Done");
            setAct(null);
            qc.invalidateQueries({ queryKey: ["admin-trade", id] });
          } catch (e) { toast("danger", errorText(e)); }
        }}>Confirm</Button>
      }>
        <Textarea placeholder="Reason / findings (written to the audit log)" value={text} onChange={(e) => setText(e.target.value)} />
      </Modal>
    </>
  );
}
