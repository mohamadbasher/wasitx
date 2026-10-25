"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Badge, Button, Card, Tabs, useToast } from "@wasitx/ui";
import { errorText, get, post } from "@/lib/api";
import { DataTable, H1, tone, useStaffMe, when } from "@/components/shell";

type Row = { id: string; type: string; referenceId: string; payload: Record<string, unknown>; status: string; requestedById: string; requestedBy: string | null; requestNote: string | null; decidedBy: string | null; decisionNote: string | null; error: string | null; createdAt: string };

export default function ApprovalsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useStaffMe().data;
  const [status, setStatus] = useState("PENDING");
  const q = useQuery({ queryKey: ["approvals", status], queryFn: () => get<Row[]>(`/admin/approvals${status ? `?status=${status}` : ""}`), refetchInterval: 15_000 });
  const decide = async (id: string, verdict: "approve" | "reject") => {
    try {
      await post(`/admin/approvals/${id}/${verdict}`, {});
      toast("success", verdict === "approve" ? "Approved and executed" : "Rejected");
      qc.invalidateQueries({ queryKey: ["approvals"] });
    } catch (e) {
      toast("danger", errorText(e));
    }
  };
  return (
    <>
      <H1 sub="High-risk manual operations need a second, different staff member with the right permission.">Approvals (four-eyes)</H1>
      <Alert tone="info" className="mb-4">You cannot approve a request you raised. Approval executes the operation immediately through the owning module.</Alert>
      <Tabs className="mb-4" size="sm" value={status} onChange={setStatus} items={["PENDING", "EXECUTED", "REJECTED", "FAILED", ""].map((s) => ({ value: s, label: s || "All" }))} />
      <Card className="overflow-hidden">
        <DataTable rows={q.data} empty="Nothing waiting" cols={[
          { h: "Type", c: (r) => r.type },
          { h: "Payload", c: (r) => <code className="text-xs text-muted">{JSON.stringify(r.payload).slice(0, 120)}</code> },
          { h: "Requested by", c: (r) => <>{r.requestedBy ?? r.requestedById}<span className="block text-xs text-muted">{r.requestNote}</span></> },
          { h: "Status", c: (r) => <><Badge tone={tone(r.status)}>{r.status}</Badge>{r.error && <span className="block text-xs text-danger">{r.error}</span>}</> },
          { h: "Decided by", c: (r) => r.decidedBy ?? "—" },
          { h: "Created", c: (r) => when(r.createdAt) },
          { h: "", c: (r) => r.status === "PENDING" && r.requestedById !== me?.id ? <span className="flex gap-1"><Button size="sm" onClick={() => decide(r.id, "approve")}>Approve</Button><Button size="sm" variant="ghost" className="text-danger" onClick={() => decide(r.id, "reject")}>Reject</Button></span> : null },
        ]} />
      </Card>
    </>
  );
}
