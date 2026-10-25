"use client";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Alert, Badge, Card, Skeleton, Stat } from "@wasitx/ui";
import { get } from "@/lib/api";
import { H1, when } from "@/components/shell";

interface Overview {
  tradingMode: string;
  registeredUsers: number;
  verifiedUsers: number;
  activeTraders30d: number;
  volumeToday: { usdt: string; ils: string; trades: number };
  volumeMonth: { usdt: string; ils: string; trades: number };
  completedTrades30d: number;
  failedTrades30d: number;
  disputeRate30d: string;
  feesTotalUsdt: string;
  feesMonthUsdt: string;
  openRiskAlerts: number;
  openComplianceCases: number;
  kycQueue: number;
  pendingApprovals: number;
  pendingPayments: number;
  openDisputes: number;
  reconciliation: { ok: boolean; exceptions: number; ranAt: string } | null;
}

export default function OverviewPage() {
  const q = useQuery({ queryKey: ["overview"], queryFn: () => get<Overview>("/admin/overview"), refetchInterval: 30_000 });
  const d = q.data;
  return (
    <>
      <H1 sub="Definitions: volume counts COMPLETED trades by completion time (Asia/Jerusalem); fees come from the ledger fee-revenue account." action={d && <Badge tone={d.tradingMode === "SANDBOX" ? "warning" : "success"}>{d.tradingMode}</Badge>}>
        Overview
      </H1>
      {!d ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="space-y-6">
          {d.reconciliation && (
            <Alert tone={d.reconciliation.ok ? "success" : "danger"} title={d.reconciliation.ok ? "Ledger reconciled with custodian" : `${d.reconciliation.exceptions} reconciliation exception(s)`}>
              Last run {when(d.reconciliation.ranAt)} · <Link href="/settings" className="font-semibold underline">details</Link>
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Registered users" value={d.registeredUsers} />
            <Stat label="Verified users" value={d.verifiedUsers} hint={d.registeredUsers ? `${((d.verifiedUsers / d.registeredUsers) * 100).toFixed(1)}% of registered` : undefined} />
            <Stat label="Active traders (30d)" value={d.activeTraders30d} />
            <Stat label="Dispute rate (30d)" value={`${d.disputeRate30d}%`} />
            <Stat label="Volume today" value={`${d.volumeToday.usdt} USDT`} hint={`₪${d.volumeToday.ils} · ${d.volumeToday.trades} trades`} />
            <Stat label="Volume this month" value={`${d.volumeMonth.usdt} USDT`} hint={`₪${d.volumeMonth.ils} · ${d.volumeMonth.trades} trades`} />
            <Stat label="Completed / failed (30d)" value={`${d.completedTrades30d} / ${d.failedTrades30d}`} />
            <Stat label="Platform fees (month)" value={`${d.feesMonthUsdt} USDT`} hint={`All time ${d.feesTotalUsdt} USDT`} />
          </div>
          <Card className="p-5">
            <p className="mb-4 text-sm font-semibold">Work queues</p>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["KYC reviews", d.kycQueue, "/kyc"],
                ["Approvals", d.pendingApprovals, "/approvals"],
                ["Open disputes", d.openDisputes, "/disputes"],
                ["Risk alerts", d.openRiskAlerts, "/compliance"],
                ["Compliance cases", d.openComplianceCases, "/compliance"],
                ["Pending payments", d.pendingPayments, "/trades?status=AWAITING_FIAT_PAYMENT"],
              ].map(([label, n, href]) => (
                <Link key={label as string} href={href as string} className="flex items-center justify-between rounded-lg border border-border p-3 hover:border-accent/50">
                  <span className="text-sm text-muted">{label}</span>
                  <span className="flex items-center gap-1 text-lg font-semibold">
                    {Number(n) > 0 ? <AlertTriangle className="size-4 text-warning" /> : <CheckCircle2 className="size-4 text-success" />}
                    {n}
                  </span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
