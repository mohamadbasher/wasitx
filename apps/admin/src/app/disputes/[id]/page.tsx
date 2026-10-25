"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use, useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, Checkbox, Field, Modal, Select, Skeleton, Textarea, cn, useToast } from "@wasitx/ui";
import type { DisputeDto } from "@wasitx/shared";
import { API_URL, errorText, get, post, session } from "@/lib/api";
import { H1, tone, when } from "@/components/shell";

async function openFile(id: string) {
  const s = session.get();
  const r = await fetch(`${API_URL}/files/${id}`, { headers: { authorization: `Bearer ${s?.accessToken}` } });
  if (!r.ok) return;
  window.open(URL.createObjectURL(await r.blob()), "_blank", "noopener");
}

export default function DisputeDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["admin-dispute", id], queryFn: () => get<DisputeDto>(`/disputes/${id}`) });
  const [note, setNote] = useState("");
  const [internal, setInternal] = useState(true);
  const [modal, setModal] = useState<null | "info" | "escalate" | "resolve">(null);
  const [party, setParty] = useState("BOTH");
  const [outcome, setOutcome] = useState("RELEASE_TO_BUYER");
  const [text, setText] = useState("");
  const d = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-dispute", id] });
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      const r = (await fn()) as { pendingApproval?: boolean } | undefined;
      toast("success", r?.pendingApproval ? "Resolution sent for second approval" : ok);
      setModal(null);
      setText("");
      refresh();
    } catch (e) {
      toast("danger", errorText(e));
    }
  };
  if (!d) return <Skeleton className="h-96" />;
  const open = d.status !== "RESOLVED";
  return (
    <>
      <H1 sub={<Link href={`/trades/${d.tradeId}`} className="text-accent-strong hover:underline">Trade {d.tradeReference}</Link>} action={<Badge tone={tone(d.status)}>{d.status}</Badge>}>Dispute · {d.reason}</H1>
      {open && (
        <div className="mb-5 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => run(() => post(`/admin/disputes/${id}/assign`), "Assigned to you")}>Assign to me</Button>
          <Button variant="outline" onClick={() => setModal("info")}>Request information</Button>
          <Button variant="outline" onClick={() => setModal("escalate")}>Escalate to compliance</Button>
          <Button onClick={() => setModal("resolve")}>Resolve</Button>
        </div>
      )}
      {d.outcome && <Alert tone="success" className="mb-5" title={d.outcome}>{d.findings}</Alert>}
      <Card>
        <CardHeader title="Statements & evidence" subtitle={`Opened by ${d.openedByRole} · ${when(d.createdAt)}`} />
        <ul className="space-y-3 p-5">
          {d.messages.map((m) => (
            <li key={m.id} className={cn("rounded-lg border p-3 text-sm", m.authorRole === "STAFF_NOTE" ? "border-warning/40 bg-warning/5" : m.authorRole === "STAFF" ? "border-info/40 bg-info/5" : "border-border")}>
              <p className="text-xs font-semibold text-muted">{m.authorRole === "STAFF_NOTE" ? "Internal note (staff only)" : m.authorRole} · {when(m.createdAt)}</p>
              <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
              {m.evidence.map((e) => <button key={e.id} className="mt-1 block text-xs text-accent-strong underline" onClick={() => openFile(e.id)}>{e.fileName}</button>)}
            </li>
          ))}
        </ul>
        {open && (
          <form className="space-y-2 border-t border-border p-4" onSubmit={(e) => { e.preventDefault(); void run(() => post(`/admin/disputes/${id}/messages`, { body: note, staffOnly: internal }), "Saved").then(() => setNote("")); }}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note" />
            <div className="flex items-center justify-between">
              <Checkbox label="Internal (not visible to parties)" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
              <Button type="submit" disabled={!note.trim()}>Add</Button>
            </div>
          </form>
        )}
      </Card>
      <Modal open={modal === "info"} onClose={() => setModal(null)} title="Request information" footer={<Button disabled={text.length < 5} onClick={() => run(() => post(`/admin/disputes/${id}/request-info`, { party, message: text }), "Request sent")}>Send</Button>}>
        <div className="space-y-3"><Select value={party} onChange={(e) => setParty(e.target.value)}>{["BOTH", "BUYER", "SELLER"].map((p) => <option key={p}>{p}</option>)}</Select><Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="What do you need?" /></div>
      </Modal>
      <Modal open={modal === "escalate"} onClose={() => setModal(null)} title="Escalate to compliance" footer={<Button variant="danger" disabled={text.length < 3} onClick={() => run(() => post(`/admin/disputes/${id}/escalate`, { reason: text }), "Escalated")}>Escalate</Button>}>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Why?" />
      </Modal>
      <Modal open={modal === "resolve"} onClose={() => setModal(null)} title="Resolve dispute" footer={<Button disabled={text.length < 10} onClick={() => run(() => post(`/admin/disputes/${id}/resolve`, { outcome, findings: text }), "Resolved")}>Submit resolution</Button>}>
        <div className="space-y-3">
          <Field label="Outcome"><Select value={outcome} onChange={(e) => setOutcome(e.target.value)}><option value="RELEASE_TO_BUYER">Release USDT to buyer (payment verified)</option><option value="REFUND_TO_SELLER">Return USDT to seller (payment not received)</option></Select></Field>
          <Field label="Findings (shown to both parties, audited)"><Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} /></Field>
          <Alert tone="info">The resolution executes through the custody provider. Above the dual-approval threshold a second dispute manager must approve.</Alert>
        </div>
      </Modal>
    </>
  );
}
