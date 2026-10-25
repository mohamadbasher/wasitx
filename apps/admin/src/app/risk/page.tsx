"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Alert, Button, Card, CardHeader, Field, Input, Skeleton, useToast } from "@wasitx/ui";
import type { RiskRules } from "@wasitx/shared";
import { errorText, get, put } from "@/lib/api";
import { H1 } from "@/components/shell";

type Settings = { disputeAfterMinutes: number; autoWithdrawalLimitUsdt: string; markPaidGraceMinutes: number };

const RULE_FIELDS: [keyof RiskRules, string, "num" | "int"][] = [
  ["maxTradeIls", "Max single trade (₪)", "num"],
  ["dailyLimitIls", "Daily limit per user (₪)", "num"],
  ["monthlyLimitIls", "Monthly (30d) limit per user (₪)", "num"],
  ["reviewThresholdIls", "Compliance review threshold (₪)", "num"],
  ["dualApprovalThresholdUsdt", "Dual-approval threshold (USDT)", "num"],
  ["paymentWindowMinutes", "Payment window (minutes)", "int"],
  ["newAccountDays", "New-account period (days)", "int"],
  ["newAccountMaxTradeIls", "New-account max trade (₪)", "num"],
];

export default function RiskPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["risk"], queryFn: () => get<{ rules: RiskRules; settings: Settings }>("/admin/risk/rules") });
  const [rules, setRules] = useState<RiskRules | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    if (q.data) {
      setRules(q.data.rules);
      setSettings(q.data.settings);
    }
  }, [q.data]);
  if (!rules || !settings) return <Skeleton className="h-96" />;
  return (
    <>
      <H1 sub="Illustrative defaults — the business and compliance officer must confirm launch values. Every change is audited with before/after.">Risk rules</H1>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Limits & thresholds" />
          <form className="grid gap-4 p-5 sm:grid-cols-2" onSubmit={async (e) => {
            e.preventDefault();
            try { await put("/admin/risk/rules", rules); toast("success", "Risk rules saved"); qc.invalidateQueries({ queryKey: ["risk"] }); } catch (er) { toast("danger", errorText(er)); }
          }}>
            {RULE_FIELDS.map(([k, label, kind]) => (
              <Field key={k} label={label}>
                <Input inputMode="decimal" value={String(rules[k])} onChange={(e) => setRules({ ...rules, [k]: kind === "int" ? Number(e.target.value.replace(/\D/g, "")) : e.target.value })} />
              </Field>
            ))}
            <Button type="submit" className="sm:col-span-2">Save limits</Button>
          </form>
        </Card>
        <Card>
          <CardHeader title="Trading settings" />
          <form className="space-y-4 p-5" onSubmit={async (e) => {
            e.preventDefault();
            try { await put("/admin/risk/settings", settings); toast("success", "Settings saved"); } catch (er) { toast("danger", errorText(er)); }
          }}>
            <Field label="Buyer may dispute after (minutes from marked paid)"><Input value={settings.disputeAfterMinutes} onChange={(e) => setSettings({ ...settings, disputeAfterMinutes: Number(e.target.value.replace(/\D/g, "")) })} /></Field>
            <Field label="Mark-paid grace after deadline (minutes)"><Input value={settings.markPaidGraceMinutes} onChange={(e) => setSettings({ ...settings, markPaidGraceMinutes: Number(e.target.value.replace(/\D/g, "")) })} /></Field>
            <Field label="Auto-approve withdrawals up to (USDT, screening CLEAR)"><Input value={settings.autoWithdrawalLimitUsdt} onChange={(e) => setSettings({ ...settings, autoWithdrawalLimitUsdt: e.target.value })} /></Field>
            <Button type="submit">Save settings</Button>
          </form>
          <Alert tone="info" className="m-5 mt-0">Paid trades never auto-expire, regardless of these settings.</Alert>
        </Card>
      </div>
    </>
  );
}
