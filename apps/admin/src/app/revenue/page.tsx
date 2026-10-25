"use client";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";
import { Button, Card, CardHeader, Skeleton, Stat, Tabs } from "@wasitx/ui";
import { download, get } from "@/lib/api";
import { DataTable, H1 } from "@/components/shell";

type Rev = { days: number; totalUsdt: string; series: { day: string; feesUsdt: string; trades: number }[] };

/** Fills missing days with zero so the bars sit on a continuous time axis. */
function continuous(series: Rev["series"], days: number) {
  const byDay = new Map(series.map((s) => [s.day, s]));
  const out: Rev["series"] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(Date.now() - i * 86_400_000));
    out.push(byDay.get(d) ?? { day: d, feesUsdt: "0.00", trades: 0 });
  }
  return out;
}

function FeeChart({ data }: { data: Rev["series"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = data.map((d) => Number(d.feesUsdt)); // display only — accounting stays in strings/bigint
  const max = Math.max(1, ...values);
  const ticks = [0, max / 2, max];
  const W = 760, H = 220, padL = 44, padB = 22, padT = 12, gap = 2;
  const plotH = H - padB - padT;
  const bw = (W - padL) / data.length - gap;
  const allZero = values.every((v) => v === 0);
  return (
    <div className="relative">
      {allZero && <p className="absolute inset-0 grid place-items-center text-sm text-muted">No fee revenue in this period</p>}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Daily platform fees (USDT)">
        {ticks.map((t) => {
          const y = padT + plotH * (1 - t / max);
          return (
            <g key={t}>
              <line x1={padL} x2={W} y1={y} y2={y} stroke="var(--wx-border)" strokeWidth={1} />
              <text x={padL - 6} y={y + 4} textAnchor="end" fontSize="10" fill="var(--wx-subtle)">{t.toFixed(t < 10 ? 2 : 0)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = Math.max(values[i]! > 0 ? 2 : 0, (plotH * values[i]!) / max);
          const x = padL + i * (bw + gap);
          const y = H - padB - h;
          const r = Math.min(4, bw / 2, h);
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={x - gap / 2} y={0} width={bw + gap} height={H - padB} fill="transparent" />
              {h > 0 && <path d={`M${x},${H - padB} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${H - padB} Z`} fill="var(--wx-chart-1)" opacity={hover === null || hover === i ? 1 : 0.55} />}
              {i % Math.ceil(data.length / 8) === 0 && <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--wx-subtle)">{d.day.slice(5)}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-2 rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-xl" style={{ left: `${Math.min(80, ((hover + 0.5) / data.length) * 100)}%` }}>
          <p className="font-semibold text-fg">{data[hover]!.day}</p>
          <p className="text-muted">{data[hover]!.feesUsdt} USDT · {data[hover]!.trades} trades</p>
        </div>
      )}
    </div>
  );
}

export default function RevenuePage() {
  const [days, setDays] = useState("30");
  const q = useQuery({ queryKey: ["revenue", days], queryFn: () => get<Rev>(`/admin/revenue?days=${days}`) });
  const series = q.data ? continuous(q.data.series, Number(days)) : undefined;
  return (
    <>
      <H1 sub="Source: ledger postings to PLATFORM_FEE_REVENUE (accounting source of truth), grouped by Asia/Jerusalem date." action={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => download("/admin/reports/fees.csv", "fees.csv")}><Download className="size-4" />Fees CSV</Button>
          <Button variant="outline" size="sm" onClick={() => download("/admin/reports/trades.csv", "trades.csv")}><Download className="size-4" />Trades CSV</Button>
          <Button variant="outline" size="sm" onClick={() => download("/admin/reports/ledger.csv", "ledger.csv")}><Download className="size-4" />Ledger CSV</Button>
        </div>
      }>Revenue</H1>
      <div className="mb-4 flex items-center justify-between">
        <Tabs size="sm" value={days} onChange={setDays} items={[{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }]} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={`Fees (${days}d)`} value={q.data ? `${q.data.totalUsdt} USDT` : "…"} />
        <Stat label="Fee-bearing settlements" value={q.data ? q.data.series.reduce((s, x) => s + x.trades, 0) : "…"} />
        <Stat label="VAT" value="Pending advice" hint="Treatment per professional Israeli tax advice" />
      </div>
      <Card className="mt-5">
        <CardHeader title="Daily platform fees (USDT)" />
        <div className="p-5">{series ? <FeeChart data={series} /> : <Skeleton className="h-56" />}</div>
      </Card>
      <Card className="mt-5 overflow-hidden">
        <CardHeader title="Table view" />
        <DataTable rows={series?.filter((s) => s.trades > 0).reverse()} empty="No fee revenue in this period" cols={[{ h: "Date", c: (r) => r.day }, { h: "Fees (USDT)", c: (r) => r.feesUsdt }, { h: "Settlements", c: (r) => r.trades }]} />
      </Card>
    </>
  );
}
