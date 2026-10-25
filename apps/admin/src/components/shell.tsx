"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BadgeCheck,
  BarChart3,
  Coins,
  FileClock,
  Gauge,
  Gavel,
  Inbox,
  LogOut,
  Megaphone,
  Network,
  Percent,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Stamp,
  Users,
  UserCog,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Badge, Button, Card, cn, Logo, Skeleton } from "@wasitx/ui";
import type { MeDto, Permission } from "@wasitx/shared";
import { BRAND, get, post, session } from "@/lib/api";

const NAV: { href: string; label: string; icon: typeof Gauge; perm?: Permission }[] = [
  { href: "/", label: "Overview", icon: Gauge },
  { href: "/users", label: "Users", icon: Users, perm: "users:read" },
  { href: "/kyc", label: "Verification queue", icon: BadgeCheck, perm: "kyc:review" },
  { href: "/trades", label: "Transaction monitor", icon: Activity, perm: "trades:read_all" },
  { href: "/disputes", label: "Dispute center", icon: Gavel, perm: "disputes:read" },
  { href: "/approvals", label: "Approvals (4-eyes)", icon: Stamp, perm: "approvals:decide" },
  { href: "/compliance", label: "Risk & compliance", icon: ShieldAlert, perm: "compliance:read" },
  { href: "/risk", label: "Risk rules", icon: SlidersHorizontal, perm: "risk:manage" },
  { href: "/revenue", label: "Revenue", icon: BarChart3, perm: "revenue:read" },
  { href: "/commission", label: "Commission", icon: Percent, perm: "revenue:read" },
  { href: "/support", label: "Support inbox", icon: Inbox, perm: "support:manage" },
  { href: "/payments", label: "Payments & networks", icon: Network },
  { href: "/announcements", label: "Announcements", icon: Megaphone },
  { href: "/audit", label: "Audit log", icon: FileClock, perm: "audit:read" },
  { href: "/employees", label: "Employees", icon: UserCog, perm: "users:read" },
  { href: "/settings", label: "Settings & gates", icon: Settings, perm: "config:manage" },
];

export function useStaffMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => get<MeDto>("/auth/me"), retry: false, enabled: typeof window !== "undefined" && !!session.get() });
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const me = useStaffMe();

  useEffect(() => {
    setReady(true);
    if (pathname !== "/login" && !session.get()) router.replace("/login");
  }, [pathname, router]);

  if (pathname === "/login") return <>{children}</>;
  if (!ready || me.isLoading) return <div className="p-10"><Skeleton className="h-10 w-64" /></div>;
  if (me.isError || !me.data) {
    if (typeof window !== "undefined") router.replace("/login");
    return null;
  }
  if (!me.data.permissions.includes("admin:access")) {
    return <div className="grid min-h-dvh place-items-center p-6"><Card className="p-8 text-center"><p className="font-semibold">This account has no staff access.</p><Button className="mt-4" onClick={() => { session.clear(); router.replace("/login"); }}>Sign out</Button></Card></div>;
  }
  const perms = new Set(me.data.permissions);
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-border bg-surface lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <Logo brand={BRAND} />
          <Badge tone="info">Staff</Badge>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {NAV.filter((n) => !n.perm || perms.has(n.perm)).map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium", active ? "bg-accent/12 text-accent-strong" : "text-muted hover:bg-surface-2 hover:text-fg")}>
                <Icon className="size-4" /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-4">
          <p className="truncate text-sm font-semibold">{me.data.displayName}</p>
          <p className="truncate text-xs text-muted">{me.data.roles.filter((r) => r !== "USER").join(", ")}</p>
          <Button variant="ghost" size="sm" className="mt-2 w-full justify-start" onClick={async () => { await post("/auth/logout").catch(() => undefined); session.clear(); qc.clear(); router.replace("/login"); }}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3 border-b border-border bg-warning/10 px-6 py-2 text-xs font-medium text-warning">
          <Coins className="size-3.5" /> Every action here is permission-checked by the API and written to the tamper-evident audit log.
        </div>
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export function H1({ children, sub, action }: { children: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{children}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function DataTable<T>({ rows, cols, empty = "Nothing here", onRow }: { rows: T[] | undefined; cols: { h: string; c: (r: T) => ReactNode; cls?: string }[]; empty?: string; onRow?: (r: T) => string }) {
  if (!rows) return <Skeleton className="h-48 w-full" />;
  if (!rows.length) return <p className="p-10 text-center text-sm text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-subtle">
          <tr>{cols.map((c) => <th key={c.h} className="whitespace-nowrap px-4 py-3 text-start font-medium">{c.h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-surface-2/60">
              {cols.map((c, j) => (
                <td key={c.h} className={cn("px-4 py-3 align-middle", c.cls)}>
                  {j === 0 && onRow ? <Link href={onRow(r)} className="font-medium text-accent-strong hover:underline">{c.c(r)}</Link> : c.c(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const when = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat("en-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)) : "—");

export function tone(status: string): "success" | "warning" | "danger" | "info" | "neutral" | "accent" {
  if (/COMPLETED|APPROVED|VERIFIED|RESOLVED|EXECUTED|CONFIRMED|ACTIVE|CLEAR|CLOSED_NO/.test(status)) return "success";
  if (/DISPUTE|FROZEN|REJECTED|FAILED|CRITICAL|SUSPENDED|BLOCK|ESCALATED/.test(status)) return "danger";
  if (/PENDING|REVIEW|AWAITING|OPEN|HIGH|RESTRICTED|MARKED/.test(status)) return "warning";
  if (/CANCELLED|EXPIRED|CLOSED/.test(status)) return "neutral";
  return "info";
}
