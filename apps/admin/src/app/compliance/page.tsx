"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, Modal, Select, Tabs, Textarea, useToast } from "@wasitx/ui";
import { errorText, get, post } from "@/lib/api";
import { DataTable, H1, tone, when } from "@/components/shell";

type Flag = { id: string; userId: string | null; tradeId: string | null; type: string; severity: string; details: unknown; createdAt: string; resolvedAt: string | null };
type Case = { id: string; type: string; status: string; priority: string; userId: string | null; tradeId: string | null; summary: string; createdAt: string; notes: { id: string; body: string; createdAt: string }[] };

export default function CompliancePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<"alerts" | "cases">("alerts");
  const flags = useQuery({ queryKey: ["flags"], queryFn: () => get<Flag[]>("/admin/compliance/alerts") });
  const cases = useQuery({ queryKey: ["cases"], queryFn: () => get<Case[]>("/admin/compliance/cases") });
  const [flag, setFlag] = useState<Flag | null>(null);
  const [kase, setKase] = useState<Case | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("IN_PROGRESS");
  const links = (r: { userId: string | null; tradeId: string | null }) => (
    <span className="flex gap-2 text-xs">
      {r.userId && <Link className="text-accent-strong underline" href={`/users/${r.userId}`}>user</Link>}
      {r.tradeId && <Link className="text-accent-strong underline" href={`/trades/${r.tradeId}`}>trade</Link>}
    </span>
  );
  return (
    <>
      <H1 sub="Automated risk signals and compliance case management (KYC, sanctions, suspicious activity, chat, wallet risk).">Risk & compliance</H1>
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ value: "alerts", label: "Open risk alerts", count: flags.data?.length }, { value: "cases", label: "Open cases", count: cases.data?.length }]} />
      <Card className="overflow-hidden">
        {tab === "alerts" ? (
          <DataTable rows={flags.data} empty="No open alerts" cols={[
            { h: "Severity", c: (f) => <Badge tone={tone(f.severity)}>{f.severity}</Badge> },
            { h: "Type", c: (f) => f.type },
            { h: "Details", c: (f) => <code className="text-xs text-muted">{JSON.stringify(f.details ?? {}).slice(0, 100)}</code> },
            { h: "Links", c: links },
            { h: "Raised", c: (f) => when(f.createdAt) },
            { h: "", c: (f) => <Button size="sm" variant="outline" onClick={() => { setFlag(f); setText(""); }}>Resolve</Button> },
          ]} />
        ) : (
          <DataTable rows={cases.data} empty="No open cases" cols={[
            { h: "Priority", c: (c) => <Badge tone={tone(c.priority)}>{c.priority}</Badge> },
            { h: "Type", c: (c) => c.type },
            { h: "Summary", c: (c) => <>{c.summary}{c.notes.length > 0 && <span className="block text-xs text-muted">{c.notes.length} note(s)</span>}</> },
            { h: "Status", c: (c) => <Badge tone={tone(c.status)}>{c.status}</Badge> },
            { h: "Links", c: links },
            { h: "Opened", c: (c) => when(c.createdAt) },
            { h: "", c: (c) => <Button size="sm" variant="outline" onClick={() => { setKase(c); setText(""); setStatus(c.status); }}>Work</Button> },
          ]} />
        )}
      </Card>
      <Modal open={!!flag} onClose={() => setFlag(null)} title={`Resolve ${flag?.type}`} footer={<Button disabled={text.length < 3} onClick={async () => {
        try { await post(`/admin/compliance/alerts/${flag!.id}/resolve`, { resolution: text }); setFlag(null); qc.invalidateQueries({ queryKey: ["flags"] }); } catch (e) { toast("danger", errorText(e)); }
      }}>Resolve</Button>}>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Resolution (audited)" />
      </Modal>
      <Modal open={!!kase} onClose={() => setKase(null)} title={`${kase?.type} case`} size="lg" footer={<Button onClick={async () => {
        try { await post(`/admin/compliance/cases/${kase!.id}`, { status, note: text || undefined }); setKase(null); qc.invalidateQueries({ queryKey: ["cases"] }); } catch (e) { toast("danger", errorText(e)); }
      }}>Save</Button>}>
        <div className="space-y-3">
          <p className="text-sm">{kase?.summary}</p>
          <Card><CardHeader title="Notes" /><ul className="space-y-2 p-4 text-sm">{kase?.notes.map((n) => <li key={n.id}><span className="text-xs text-muted">{when(n.createdAt)}</span><p>{n.body}</p></li>)}</ul></Card>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>{["OPEN", "IN_PROGRESS", "ESCALATED", "CLOSED_NO_ACTION", "CLOSED_REPORTED"].map((s) => <option key={s}>{s}</option>)}</Select>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note" />
          <p className="text-xs text-muted">CLOSED_REPORTED records that an unusual-activity report was filed with the competent authority (filed outside this system per procedure).</p>
        </div>
      </Modal>
    </>
  );
}
