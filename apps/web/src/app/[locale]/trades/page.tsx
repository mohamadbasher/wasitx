"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowLeftRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, Skeleton, Tabs } from "@wasitx/ui";
import type { Paginated, TradeDto } from "@wasitx/shared";
import { Container, Num, PageHeader, RequireAuth, TradeStatusBadge } from "@/components/app";
import { Link } from "@/i18n/navigation";
import { get } from "@/lib/api";
import { useFmt } from "@/lib/hooks";

type Scope = "active" | "completed" | "cancelled" | "disputed";

export default function TradesPage() {
  const t = useTranslations();
  const f = useFmt();
  const [scope, setScope] = useState<Scope>("active");
  const q = useInfiniteQuery({
    queryKey: ["trades", scope],
    initialPageParam: "",
    queryFn: ({ pageParam }) => get<Paginated<TradeDto>>(`/trades?scope=${scope}&limit=20${pageParam ? `&cursor=${pageParam}` : ""}`),
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <RequireAuth>
      {() => (
        <Container>
          <PageHeader title={t("trade.historyTitle")} />
          <Tabs className="mb-5" value={scope} onChange={setScope} items={(["active", "completed", "cancelled", "disputed"] as const).map((s) => ({ value: s, label: t(`trade.scope_${s}`) }))} />
          <Card className="overflow-hidden">
            {q.isLoading ? (
              <Skeleton className="m-4 h-40" />
            ) : !items.length ? (
              <EmptyState icon={<ArrowLeftRight className="size-5" />} title={t("trade.empty")} action={<Link href="/market"><Button size="sm">{t("home.ctaSecondary")}</Button></Link>} />
            ) : (
              <ul className="divide-y divide-border">
                {items.map((tr) => {
                  const other = tr.myRole === "buyer" ? tr.seller : tr.buyer;
                  return (
                    <li key={tr.id}>
                      <Link href={`/trades/${tr.id}`} className="grid gap-2 px-5 py-4 hover:bg-surface-2 sm:grid-cols-[120px_1fr_1fr_auto] sm:items-center">
                        <div className="flex items-center gap-2">
                          <Badge tone={tr.myRole === "buyer" ? "accent" : "info"}>{t(`trade.role_${tr.myRole === "seller" ? "seller" : "buyer"}`)}</Badge>
                          {tr.unreadMessages > 0 && <span className="size-2 rounded-full bg-danger" aria-label="unread" />}
                        </div>
                        <div>
                          <p className="font-mono text-sm text-fg">{tr.reference}</p>
                          <p className="text-xs text-muted">{other.displayName} · <span className="num">{f.dateTime(tr.createdAt)}</span></p>
                        </div>
                        <p className="text-sm font-semibold text-fg"><Num>{f.usdt(tr.amountUsdt)} USDT</Num> <span className="font-normal text-muted">· <Num>{f.ils(tr.fiatAmountIls)}</Num></span></p>
                        <TradeStatusBadge status={tr.status} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          {q.hasNextPage && <div className="mt-4 text-center"><Button variant="outline" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>{t("common.loadMore")}</Button></div>}
        </Container>
      )}
    </RequireAuth>
  );
}
