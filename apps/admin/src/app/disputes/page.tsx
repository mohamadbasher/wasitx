"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Card, Tabs } from "@wasitx/ui";
import { get } from "@/lib/api";
import { DataTable, H1, tone, when } from "@/components/shell";

type Row = { id: string; tradeReference: string; tradeStatus: string; amountUsdt: string; fiatAgorot: string; reason: string; status: string; openedByRole: string; assignedToId: string | null; createdAt: string };
const ils = (agorot: string) => `₪${(BigInt(agorot) / 100n).toString()}.${(BigInt(agorot) % 100n).toString().padStart(2, "0")}`;
const usdt = (micro: string) => `${(BigInt(micro) / 1_000_000n).toString()}.${((BigInt(micro) % 1_000_000n) / 10_000n).toString().padStart(2, "0")}`;

export default function DisputesPage() {
  const [status, setStatus] = useState("");
  const q = useQuery({ queryKey: ["admin-disputes", status], queryFn: () => get<Row[]>(`/admin/disputes${status ? `?status=${status}` : ""}`), refetchInterval: 20_000 });
  return (
    <>
      <H1 sub="Oldest first. Resolutions at or above the dual-approval threshold need a second dispute manager.">Dispute center</H1>
      <Tabs className="mb-4" size="sm" value={status} onChange={setStatus} items={[{ value: "", label: "All" }, ...["OPEN", "AWAITING_INFO", "UNDER_REVIEW", "ESCALATED", "RESOLVED"].map((s) => ({ value: s, label: s }))]} />
      <Card className="overflow-hidden">
        <DataTable rows={q.data} onRow={(r) => `/disputes/${r.id}`} empty="No disputes" cols={[
          { h: "Trade", c: (r) => <span className="font-mono">{r.tradeReference}</span> },
          { h: "Status", c: (r) => <Badge tone={tone(r.status)}>{r.status}</Badge> },
          { h: "Reason", c: (r) => r.reason },
          { h: "Opened by", c: (r) => r.openedByRole },
          { h: "Amount", c: (r) => `${usdt(r.amountUsdt)} USDT · ${ils(r.fiatAgorot)}` },
          { h: "Assigned", c: (r) => (r.assignedToId ? "yes" : "—") },
          { h: "Opened", c: (r) => when(r.createdAt) },
        ]} />
      </Card>
    </>
  );
}
