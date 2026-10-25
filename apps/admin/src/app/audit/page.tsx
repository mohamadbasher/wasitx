"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Alert, Badge, Button, Card, Input } from "@wasitx/ui";
import { errorText, get } from "@/lib/api";
import { DataTable, H1, when } from "@/components/shell";

type E = { id: string; actorType: string; actorId: string | null; action: string; entityType: string; entityId: string | null; ip: string | null; data: unknown; digest: string; createdAt: string };
type V = { ok: boolean; checkedRows: number; checkedSeals: number; problem: string | null };

export default function AuditPage() {
  const [q, setQ] = useState("");
  const [verify, setVerify] = useState<V | string | null>(null);
  const list = useInfiniteQuery({
    queryKey: ["audit", q],
    initialPageParam: "",
    queryFn: ({ pageParam }) => get<{ items: E[]; nextCursor: string | null }>(`/admin/audit?limit=100${q ? `&q=${encodeURIComponent(q)}` : ""}${pageParam ? `&cursor=${pageParam}` : ""}`),
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  return (
    <>
      <H1 sub="Append-only (database triggers). Each row carries a content digest; settled ranges are chained by periodic seals." action={
        <Button variant="outline" onClick={async () => { setVerify(null); try { setVerify(await get<V>("/admin/audit/verify")); } catch (e) { setVerify(errorText(e)); } }}><ShieldCheck className="size-4" />Verify integrity</Button>
      }>Audit log</H1>
      {verify && (typeof verify === "string" ? <Alert tone="danger" className="mb-4">{verify}</Alert> : (
        <Alert tone={verify.ok ? "success" : "danger"} className="mb-4" title={verify.ok ? "Audit log intact" : "Integrity problem detected"}>
          {verify.checkedRows} rows and {verify.checkedSeals} seals checked{verify.problem ? ` — ${verify.problem}` : ""}. Rows written before the digest scheme (dev databases) report as altered.
        </Alert>
      ))}
      <Input className="mb-4 max-w-sm" placeholder="Action contains, or entity/actor id" value={q} onChange={(e) => setQ(e.target.value.trim())} />
      <Card className="overflow-hidden">
        <DataTable rows={list.data?.pages.flatMap((p) => p.items)} cols={[
          { h: "#", c: (e) => <span className="font-mono text-xs">{e.id}</span> },
          { h: "When", c: (e) => when(e.createdAt), cls: "whitespace-nowrap" },
          { h: "Actor", c: (e) => <><Badge tone={e.actorType === "STAFF" ? "info" : e.actorType === "SYSTEM" ? "neutral" : "accent"}>{e.actorType}</Badge><span className="block font-mono text-[10px] text-muted">{e.actorId}</span></> },
          { h: "Action", c: (e) => <span className="font-mono text-xs">{e.action}</span> },
          { h: "Entity", c: (e) => <span className="text-xs">{e.entityType}<span className="block font-mono text-[10px] text-muted">{e.entityId}</span></span> },
          { h: "Data", c: (e) => <code className="block max-w-xs truncate text-[11px] text-muted">{e.data ? JSON.stringify(e.data) : ""}</code> },
          { h: "IP", c: (e) => <span className="text-xs">{e.ip}</span> },
          { h: "Digest", c: (e) => <span className="font-mono text-[10px] text-subtle">{e.digest}</span> },
        ]} />
      </Card>
      {list.hasNextPage && <Button variant="outline" className="mt-4" onClick={() => list.fetchNextPage()}>Load more</Button>}
    </>
  );
}
