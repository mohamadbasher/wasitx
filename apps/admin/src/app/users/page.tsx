"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Button, Card, Input, Select } from "@wasitx/ui";
import { get } from "@/lib/api";
import { DataTable, H1, tone, when } from "@/components/shell";

type U = { id: string; email: string; displayName: string; status: string; roles: string[]; kycStatus: string; riskLevel: string | null; completedTrades: number; mfaEnabled: boolean; createdAt: string };

export default function UsersPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const list = useInfiniteQuery({
    queryKey: ["admin-users", q, status],
    initialPageParam: "",
    queryFn: ({ pageParam }) => get<{ items: U[]; nextCursor: string | null }>(`/admin/users?limit=50${q ? `&q=${encodeURIComponent(q)}` : ""}${status ? `&status=${status}` : ""}${pageParam ? `&cursor=${pageParam}` : ""}`),
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  return (
    <>
      <H1>Users</H1>
      <div className="mb-4 flex flex-wrap gap-3">
        <Input className="max-w-xs" placeholder="Email, name or ID" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select className="max-w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["ACTIVE", "RESTRICTED", "SUSPENDED", "CLOSED"].map((s) => <option key={s}>{s}</option>)}
        </Select>
      </div>
      <Card className="overflow-hidden">
        <DataTable
          rows={list.data?.pages.flatMap((p) => p.items)}
          onRow={(u) => `/users/${u.id}`}
          cols={[
            { h: "User", c: (u) => <><span>{u.displayName}</span><span className="block text-xs text-muted">{u.email}</span></> },
            { h: "Status", c: (u) => <Badge tone={tone(u.status)}>{u.status}</Badge> },
            { h: "KYC", c: (u) => <Badge tone={tone(u.kycStatus)}>{u.kycStatus}</Badge> },
            { h: "Risk", c: (u) => u.riskLevel ?? "—" },
            { h: "Roles", c: (u) => u.roles.filter((r) => r !== "USER").join(", ") || "—" },
            { h: "Trades", c: (u) => u.completedTrades },
            { h: "MFA", c: (u) => (u.mfaEnabled ? "✓" : "—") },
            { h: "Joined", c: (u) => when(u.createdAt) },
          ]}
        />
      </Card>
      {list.hasNextPage && <Button variant="outline" className="mt-4" onClick={() => list.fetchNextPage()}>Load more</Button>}
    </>
  );
}
