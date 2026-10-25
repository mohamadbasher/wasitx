"use client";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card } from "@wasitx/ui";
import { get } from "@/lib/api";
import { DataTable, H1, tone, when } from "@/components/shell";

type Emp = { id: string; email: string; displayName: string; roles: string[]; mfaEnabled: boolean; status: string; lastSeenAt: string | null };

export default function EmployeesPage() {
  const q = useQuery({ queryKey: ["employees"], queryFn: () => get<Emp[]>("/admin/employees") });
  return (
    <>
      <H1 sub="Grant or revoke roles from a user's page. Privileged grants need a second approver.">Employees</H1>
      <Card className="overflow-hidden">
        <DataTable rows={q.data} onRow={(e) => `/users/${e.id}`} cols={[
          { h: "Name", c: (e) => <>{e.displayName}<span className="block text-xs text-muted">{e.email}</span></> },
          { h: "Roles", c: (e) => <span className="flex flex-wrap gap-1">{e.roles.filter((r) => r !== "USER").map((r) => <Badge key={r} tone="info">{r}</Badge>)}</span> },
          { h: "MFA", c: (e) => <Badge tone={e.mfaEnabled ? "success" : "danger"}>{e.mfaEnabled ? "ON" : "NOT ENROLLED"}</Badge> },
          { h: "Status", c: (e) => <Badge tone={tone(e.status)}>{e.status}</Badge> },
          { h: "Last seen", c: (e) => when(e.lastSeenAt) },
        ]} />
      </Card>
    </>
  );
}
