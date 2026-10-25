"use client";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Plus, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, EmptyState, Skeleton, Stat } from "@wasitx/ui";
import type { BalanceDto, MeDto, Paginated, TradeDto } from "@wasitx/shared";
import { Container, Num, OnboardingChecklist, PageHeader, RequireAuth, SectionTitle, TradeStatusBadge } from "@/components/app";
import { Link } from "@/i18n/navigation";
import { get } from "@/lib/api";
import { useFmt } from "@/lib/hooks";

interface Dash {
  activeTrades: number;
  activeOffers: number;
  openDisputes: number;
  completedTrades: number;
  cancelledTrades: number;
  totalBoughtUsdt: string;
  totalSoldUsdt: string;
  feesPaidUsdt: string;
  balances: BalanceDto;
}

function DashboardBody({ me }: { me: MeDto }) {
  const t = useTranslations();
  const f = useFmt();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => get<Dash>("/me/dashboard") });
  const banks = useQuery({ queryKey: ["banks"], queryFn: () => get<{ status: string }[]>("/bank-accounts") });
  const trades = useQuery({ queryKey: ["trades", "active", "dash"], queryFn: () => get<Paginated<TradeDto>>("/trades?scope=all&limit=6") });
  const d = dash.data;
  return (
    <Container>
      <PageHeader
        title={t("dashboard.hello", { name: me.displayName })}
        subtitle={<Badge tone={me.tier === "VERIFIED_TRADER" ? "success" : "warning"}>{t(`dashboard.tier_${me.tier}`)}</Badge>}
        action={
          <div className="flex gap-2">
            <Link href="/market"><Button variant="outline"><ArrowLeftRight className="size-4" />{t("nav.market")}</Button></Link>
            <Link href="/offers/new"><Button><Plus className="size-4" />{t("dashboard.newOffer")}</Button></Link>
          </div>
        }
      />
      <div className="space-y-8">
        {banks.data && <OnboardingChecklist me={me} hasBank={banks.data.some((b) => b.status === "VERIFIED")} />}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {d ? (
            <>
              <Stat label={t("dashboard.activeTrades")} value={<Num>{d.activeTrades}</Num>} />
              <Stat label={t("dashboard.activeOffers")} value={<Num>{d.activeOffers}</Num>} />
              <Stat label={t("dashboard.completed")} value={<Num>{d.completedTrades}</Num>} hint={`${t("dashboard.cancelled")}: ${d.cancelledTrades}`} />
              <Stat label={t("dashboard.openDisputes")} value={<Num>{d.openDisputes}</Num>} />
              <Stat label={t("dashboard.totalBought")} value={<Num>{f.usdt(d.totalBoughtUsdt)}</Num>} hint="USDT" />
              <Stat label={t("dashboard.totalSold")} value={<Num>{f.usdt(d.totalSoldUsdt)}</Num>} hint="USDT" />
              <Stat label={t("dashboard.feesPaid")} value={<Num>{f.usdt(d.feesPaidUsdt)}</Num>} hint="USDT" />
              <Link href="/wallet">
                <Stat className="h-full transition-colors hover:border-accent/50" label={t("wallet.available")} value={<Num>{f.usdt(d.balances.available)}</Num>} hint={d.balances.source === "SANDBOX_CUSTODY" ? t("wallet.sandboxSource") : d.balances.sourceLabel} />
              </Link>
            </>
          ) : (
            Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)
          )}
        </div>

        <div>
          <SectionTitle action={<Link href="/trades" className="text-sm font-semibold text-accent-strong hover:underline">{t("common.viewAll")}</Link>}>
            {t("dashboard.recentTrades")}
          </SectionTitle>
          <Card className="overflow-hidden">
            {trades.isLoading ? (
              <Skeleton className="m-4 h-24" />
            ) : !trades.data?.items.length ? (
              <EmptyState icon={<Wallet className="size-5" />} title={t("trade.empty")} action={<Link href="/market"><Button size="sm">{t("home.ctaSecondary")}</Button></Link>} />
            ) : (
              <ul className="divide-y divide-border">
                {trades.data.items.map((tr) => (
                  <li key={tr.id}>
                    <Link href={`/trades/${tr.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-surface-2">
                      <div className="flex items-center gap-3">
                        <Badge tone={tr.myRole === "buyer" ? "accent" : "info"}>{t(`trade.role_${tr.myRole === "staff" ? "buyer" : tr.myRole}`)}</Badge>
                        <span className="font-mono text-sm text-muted">{tr.reference}</span>
                      </div>
                      <span className="text-sm font-semibold text-fg"><Num>{f.usdt(tr.amountUsdt)} USDT · {f.ils(tr.fiatAmountIls)}</Num></span>
                      <TradeStatusBadge status={tr.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </Container>
  );
}

export default function DashboardPage() {
  return <RequireAuth>{(me) => <DashboardBody me={me} />}</RequireAuth>;
}
