"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { use, useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, Checkbox, Field, KeyValue, Select, Skeleton, Textarea, useToast } from "@wasitx/ui";
import { ROLES } from "@wasitx/shared";
import { errorText, get, post } from "@/lib/api";
import { DataTable, H1, tone, when, useStaffMe } from "@/components/shell";

type Detail = {
  id: string; email: string; displayName: string; locale: string; phone: string | null; status: string; statusReason: string | null; roles: string[]; mfaEnabled: boolean; createdAt: string;
  kyc: null | { id: string; status: string; legalName: string | null; dateOfBirth: string | null; residencyCountry: string | null; address: string | null; occupation: string | null; expectedVolume: string | null; sourceOfFunds: string | null; selfDeclaredPep: boolean; sanctionsHit: boolean; pepHit: boolean; riskLevel: string; documentVerified: boolean; livenessVerified: boolean; provider: string | null; reviewNote: string | null; events: { from: string | null; to: string; actorType: string; note: string | null; at: string }[] };
  stats: null | { completed: number; finished: number; bought: string; sold: string; fees: string };
  balances: Record<string, string>;
  bankAccounts: { id: string; bankCode: string; branch: string; last4: string; holderName: string; status: string; nameMatchesKyc: boolean }[];
  devices: { id: string; name: string | null; lastSeenAt: string; lastIp: string | null }[];
  riskFlags: { id: string; type: string; severity: string; resolvedAt: string | null; createdAt: string }[];
  logins: { success: boolean; reason: string | null; ip: string | null; newDevice: boolean; at: string }[];
};

export default function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const toast = useToast();
  const me = useStaffMe().data;
  const q = useQuery({ queryKey: ["admin-user", id], queryFn: () => get<Detail>(`/admin/users/${id}`) });
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [roles, setRoles] = useState<string[] | null>(null);
  const u = q.data;
  if (!u) return <Skeleton className="h-96" />;
  const roleSet = roles ?? u.roles;
  const can = (p: string) => me?.permissions.includes(p as never);

  return (
    <>
      <H1 sub={u.email} action={<Badge tone={tone(u.status)}>{u.status}</Badge>}>{u.displayName}</H1>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Identity (KYC)" action={u.kyc && <Badge tone={tone(u.kyc.status)}>{u.kyc.status}</Badge>} />
          <div className="p-5">
            {u.kyc ? (
              <>
                <KeyValue items={[
                  { k: "Legal name", v: u.kyc.legalName ?? "—" },
                  { k: "Date of birth", v: u.kyc.dateOfBirth ?? "—" },
                  { k: "Verified residency", v: u.kyc.residencyCountry ?? "—" },
                  { k: "Address", v: u.kyc.address ?? "—" },
                  { k: "Occupation / volume", v: `${u.kyc.occupation ?? "—"} · ${u.kyc.expectedVolume ?? "—"}` },
                  { k: "Source of funds", v: u.kyc.sourceOfFunds ?? "—" },
                  { k: "Document / liveness", v: `${u.kyc.documentVerified ? "✓" : "✗"} / ${u.kyc.livenessVerified ? "✓" : "✗"} (${u.kyc.provider ?? "—"})` },
                  { k: "Screening", v: <span className="flex gap-1">{u.kyc.sanctionsHit && <Badge tone="danger">SANCTIONS</Badge>}{(u.kyc.pepHit || u.kyc.selfDeclaredPep) && <Badge tone="warning">PEP</Badge>}{!u.kyc.sanctionsHit && !u.kyc.pepHit && !u.kyc.selfDeclaredPep && "Clear"}</span> },
                  { k: "Risk level", v: <Badge tone={tone(u.kyc.riskLevel)}>{u.kyc.riskLevel}</Badge> },
                ]} />
                <ul className="mt-4 space-y-1 text-xs text-muted">{u.kyc.events.map((e, i) => <li key={i}>{when(e.at)} · {e.from ?? "∅"} → {e.to} ({e.actorType}){e.note ? ` — ${e.note}` : ""}</li>)}</ul>
              </>
            ) : "—"}
          </div>
        </Card>
        <Card>
          <CardHeader title="Account & balances" />
          <div className="p-5">
            <KeyValue items={[
              { k: "Phone", v: u.phone ?? "—" },
              { k: "MFA", v: u.mfaEnabled ? "Enabled" : "Off" },
              { k: "Joined", v: when(u.createdAt) },
              { k: "Trades completed / finished", v: u.stats ? `${u.stats.completed} / ${u.stats.finished}` : "—" },
              { k: "Bought / sold", v: u.stats ? `${u.stats.bought} / ${u.stats.sold} USDT` : "—" },
              ...Object.entries(u.balances).map(([k, v]) => ({ k: k.replace("USER_", "Ledger "), v: `${v} USDT` })),
            ]} />
            {u.statusReason && <Alert tone="warning" className="mt-3">Status reason: {u.statusReason}</Alert>}
          </div>
        </Card>
        {can("users:manage_status") && (
          <Card>
            <CardHeader title="Change account status" subtitle="Suspending revokes all sessions and pauses offers." />
            <div className="space-y-3 p-5">
              <Field label="New status"><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">—</option>{["ACTIVE", "RESTRICTED", "SUSPENDED", "CLOSED"].map((s) => <option key={s}>{s}</option>)}</Select></Field>
              <Field label="Reason (audited)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
              <Button disabled={!status || reason.length < 3} onClick={async () => {
                try {
                  await post(`/admin/users/${id}/status`, { status, reason });
                  toast("success", "Status updated");
                  qc.invalidateQueries({ queryKey: ["admin-user", id] });
                } catch (e) { toast("danger", errorText(e)); }
              }}>Apply</Button>
            </div>
          </Card>
        )}
        {can("roles:manage") && (
          <Card>
            <CardHeader title="Roles" subtitle="ADMIN / SUPER_ADMIN grants require a second approver." />
            <div className="grid grid-cols-2 gap-2 p-5">
              {ROLES.map((r) => <Checkbox key={r} label={r} disabled={r === "USER"} checked={roleSet.includes(r)} onChange={(e) => setRoles(e.target.checked ? [...roleSet, r] : roleSet.filter((x) => x !== r))} />)}
              <Button className="col-span-2 mt-2" disabled={!roles} onClick={async () => {
                try {
                  const r = await post<{ pendingApproval: boolean }>(`/admin/users/${id}/roles`, { roles: roleSet });
                  toast("success", r.pendingApproval ? "Sent for second approval" : "Roles updated");
                  setRoles(null);
                  qc.invalidateQueries({ queryKey: ["admin-user", id] });
                } catch (e) { toast("danger", errorText(e)); }
              }}>Save roles</Button>
            </div>
          </Card>
        )}
        <Card className="lg:col-span-2">
          <CardHeader title="Bank accounts" />
          <DataTable rows={u.bankAccounts} cols={[
            { h: "Bank / branch", c: (b) => `${b.bankCode} / ${b.branch}` },
            { h: "Account", c: (b) => `••••${b.last4}` },
            { h: "Holder", c: (b) => b.holderName },
            { h: "Name matches KYC", c: (b) => (b.nameMatchesKyc ? "✓" : "✗") },
            { h: "Status", c: (b) => <Badge tone={tone(b.status)}>{b.status}</Badge> },
          ]} />
        </Card>
        <Card>
          <CardHeader title="Risk flags" />
          <DataTable rows={u.riskFlags} empty="No flags" cols={[{ h: "Type", c: (f) => f.type }, { h: "Severity", c: (f) => <Badge tone={tone(f.severity)}>{f.severity}</Badge> }, { h: "Raised", c: (f) => when(f.createdAt) }, { h: "Resolved", c: (f) => when(f.resolvedAt) }]} />
        </Card>
        <Card>
          <CardHeader title="Sign-ins & devices" />
          <DataTable rows={u.logins} cols={[{ h: "When", c: (l) => when(l.at) }, { h: "Result", c: (l) => <Badge tone={l.success ? "success" : "danger"}>{l.success ? "OK" : l.reason ?? "FAIL"}</Badge> }, { h: "IP", c: (l) => l.ip ?? "—" }, { h: "New device", c: (l) => (l.newDevice ? "yes" : "") }]} />
        </Card>
      </div>
    </>
  );
}
