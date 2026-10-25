"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, Modal, Select, Tabs, Textarea, useToast } from "@wasitx/ui";
import { errorText, get, post } from "@/lib/api";
import { DataTable, H1, tone, when } from "@/components/shell";

type Row = { id: string; user: { id: string; email: string; displayName: string }; status: string; legalName: string; riskLevel: string; sanctionsHit: boolean; pepHit: boolean; residencyCountry: string | null; reviewNote: string | null; submittedAt: string | null };

export default function KycQueue() {
  const [status, setStatus] = useState("IN_REVIEW");
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["kyc-queue", status], queryFn: () => get<Row[]>(`/admin/kyc/queue?status=${status}`) });
  const [sel, setSel] = useState<Row | null>(null);
  const [decision, setDecision] = useState("APPROVED");
  const [note, setNote] = useState("");
  return (
    <>
      <H1 sub="Manual reviews: PEP / EDD, screening matches and provider referrals.">Verification queue</H1>
      <Tabs className="mb-4" size="sm" value={status} onChange={setStatus} items={["IN_REVIEW", "PENDING", "RESUBMISSION_REQUIRED", "REJECTED", "APPROVED"].map((s) => ({ value: s, label: s }))} />
      <Card className="overflow-hidden">
        <DataTable rows={q.data} empty="Queue is empty" cols={[
          { h: "Applicant", c: (r) => <Link href={`/users/${r.user.id}`} className="text-accent-strong hover:underline">{r.legalName || r.user.displayName}<span className="block text-xs text-muted">{r.user.email}</span></Link> },
          { h: "Screening", c: (r) => <span className="flex gap-1">{r.sanctionsHit && <Badge tone="danger">SANCTIONS</Badge>}{r.pepHit && <Badge tone="warning">PEP</Badge>}</span> },
          { h: "Residency", c: (r) => r.residencyCountry ?? "—" },
          { h: "Risk", c: (r) => <Badge tone={tone(r.riskLevel)}>{r.riskLevel}</Badge> },
          { h: "Note", c: (r) => <span className="text-xs text-muted">{r.reviewNote}</span> },
          { h: "Submitted", c: (r) => when(r.submittedAt) },
          { h: "", c: (r) => (r.status === "IN_REVIEW" ? <Button size="sm" onClick={() => { setSel(r); setNote(""); }}>Decide</Button> : null) },
        ]} />
      </Card>
      <Modal open={!!sel} onClose={() => setSel(null)} title={`Decision — ${sel?.legalName}`} footer={
        <Button disabled={note.length < 3} onClick={async () => {
          try {
            await post(`/admin/kyc/${sel!.id}/decision`, { decision, note });
            toast("success", "Decision recorded");
            setSel(null);
            qc.invalidateQueries({ queryKey: ["kyc-queue"] });
          } catch (e) { toast("danger", errorText(e)); }
        }}>Record decision</Button>
      }>
        <div className="space-y-3">
          <Select value={decision} onChange={(e) => setDecision(e.target.value)}>{["APPROVED", "RESUBMISSION_REQUIRED", "REJECTED"].map((d) => <option key={d}>{d}</option>)}</Select>
          <Textarea placeholder="Findings / EDD notes (audited)" value={note} onChange={(e) => setNote(e.target.value)} />
          {sel?.sanctionsHit && <p className="text-xs text-danger">Sanctions match: rejecting closes the case as CLOSED_REPORTED. File the report with the competent authority per procedure.</p>}
        </div>
      </Modal>
    </>
  );
}
