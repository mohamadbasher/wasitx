"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Badge, Button, Card, Input, Select } from "@wasitx/ui";
import { TRADE_STATUSES } from "@wasitx/shared";
import { get } from "@/lib/api";
import { DataTable, H1, tone, when } from "@/components/shell";

type Row = { id: string; reference: string; status: string; buyer: string; seller: string; amountUsdt: string; fiatIls: string; feeUsdt: string; requiresReleaseReview: boolean; paymentDeadline: string | null; createdAt: string };

function Inner() {
  const sp = useSearchParams();
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [q, setQ] = useState("");
  const list = useInfiniteQuery({
    queryKey: ["admin-trades", status, q],
    initialPageParam: "",
    queryFn: ({ pageParam }) => get<{ items: Row[]; nextCursor: string | null }>(`/admin/trades?limit=50${status ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}${pageParam ? `&cursor=${pageParam}` : ""}`),
    getNextPageParam: (l) => l.nextCursor ?? undefined,
    refetchInterval: 15_000,
  });
  return (
    <>
      <H1 sub="Live view of every trade. Search by trade reference, payment reference (WX…), or user ID.">Transaction monitor</H1>
      <div className="mb-4 flex flex-wrap gap-3">
        <Input className="max-w-xs" placeholder="T… / WX… / user id" value={q} onChange={(e) => setQ(e.target.value.trim())} />
        <Select className="max-w-64" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {TRADE_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </Select>
      </div>
      <Card className="overflow-hidden">
        <DataTable rows={list.data?.pages.flatMap((p) => p.items)} onRow={(r) => `/trades/${r.id}`} cols={[
          { h: "Reference", c: (r) => <span className="font-mono">{r.reference}</span> },
          { h: "Status", c: (r) => <span className="flex gap-1"><Badge tone={tone(r.status)}>{r.status}</Badge>{r.requiresReleaseReview && <Badge tone="warning">REVIEW</Badge>}</span> },
          { h: "Buyer → seller", c: (r) => `${r.buyer} ← ${r.seller}` },
          { h: "Amount", c: (r) => `${r.amountUsdt} USDT`, cls: "whitespace-nowrap" },
          { h: "Fiat", c: (r) => `₪${r.fiatIls}`, cls: "whitespace-nowrap" },
          { h: "Fee", c: (r) => r.feeUsdt },
          { h: "Deadline", c: (r) => when(r.paymentDeadline) },
          { h: "Created", c: (r) => when(r.createdAt) },
        ]} />
      </Card>
      {list.hasNextPage && <Button variant="outline" className="mt-4" onClick={() => list.fetchNextPage()}>Load more</Button>}
    </>
  );
}

export default function TradesMonitor() {
  return <Suspense><Inner /></Suspense>;
}
