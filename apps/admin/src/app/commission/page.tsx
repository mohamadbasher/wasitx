"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select, useToast } from "@wasitx/ui";
import { formatUsdt, parseUsdt, quoteFee } from "@wasitx/shared";
import { errorText, get, post } from "@/lib/api";
import { DataTable, H1, useStaffMe, when } from "@/components/shell";

type Row = { id: string; rateBps: number; minUsdt: string; maxUsdt: string; payer: string; note: string; effectiveFrom: string };

export default function CommissionPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useStaffMe().data;
  const q = useQuery({ queryKey: ["commission"], queryFn: () => get<Row[]>("/admin/commission") });
  const [f, setF] = useState({ rateBps: "75", minUsdt: "1", maxUsdt: "50", payer: "BUYER", note: "" });
  const preview = (() => {
    try {
      const cfg = { rateBps: Number(f.rateBps), minUsdtMicro: parseUsdt(f.minUsdt === "0" ? "0.000001" : f.minUsdt), maxUsdtMicro: parseUsdt(f.maxUsdt), payer: f.payer as "BUYER" };
      return ["100", "1000", "10000"].map((a) => `${a} USDT → fee ${formatUsdt(quoteFee(parseUsdt(a), cfg).feeUsdtMicro)}`);
    } catch {
      return null;
    }
  })();
  return (
    <>
      <H1 sub="Versioned: each change creates a new configuration effective immediately. Open trades keep the fee they were quoted.">Commission</H1>
      {me?.permissions.includes("commission:manage") && (
        <Card className="mb-5">
          <CardHeader title="New commission version" />
          <form className="grid gap-4 p-5 sm:grid-cols-5" onSubmit={async (e) => {
            e.preventDefault();
            try {
              await post("/admin/commission", { rateBps: Number(f.rateBps), minUsdt: f.minUsdt, maxUsdt: f.maxUsdt, payer: f.payer, note: f.note });
              toast("success", "Commission updated");
              qc.invalidateQueries({ queryKey: ["commission"] });
            } catch (er) { toast("danger", errorText(er)); }
          }}>
            <Field label="Rate (bps, 75 = 0.75%)"><Input value={f.rateBps} onChange={(e) => setF({ ...f, rateBps: e.target.value.replace(/\D/g, "") })} /></Field>
            <Field label="Min fee (USDT)"><Input value={f.minUsdt} onChange={(e) => setF({ ...f, minUsdt: e.target.value })} /></Field>
            <Field label="Max fee (USDT)"><Input value={f.maxUsdt} onChange={(e) => setF({ ...f, maxUsdt: e.target.value })} /></Field>
            <Field label="Payer"><Select value={f.payer} onChange={(e) => setF({ ...f, payer: e.target.value })}>{["BUYER", "SELLER", "SPLIT"].map((p) => <option key={p}>{p}</option>)}</Select></Field>
            <Field label="Change note (audited)"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
            {preview && <p className="text-xs text-muted sm:col-span-4">{preview.join(" · ")}</p>}
            <Button type="submit" disabled={f.note.length < 3}>Publish</Button>
          </form>
          <Alert tone="info" className="mx-5 mb-5">The live fee schedule is shown on the public Fees page and before every trade confirmation — there are no hidden charges.</Alert>
        </Card>
      )}
      <Card className="overflow-hidden">
        <DataTable rows={q.data} empty="Using built-in demo default (0.75%, min 1, max 50, buyer pays)" cols={[
          { h: "Effective from", c: (r) => when(r.effectiveFrom) },
          { h: "Rate", c: (r) => `${(r.rateBps / 100).toFixed(2)}%` },
          { h: "Min / max", c: (r) => `${r.minUsdt} / ${r.maxUsdt} USDT` },
          { h: "Payer", c: (r) => <Badge>{r.payer}</Badge> },
          { h: "Note", c: (r) => r.note },
        ]} />
      </Card>
    </>
  );
}
