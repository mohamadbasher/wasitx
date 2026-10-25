"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Badge, Card, Skeleton } from "@wasitx/ui";
import type { MarketStatsDto, OfferDto, Paginated } from "@wasitx/shared";
import { Link } from "@/i18n/navigation";
import { get } from "@/lib/api";
import { useFmt, useRealtime } from "@/lib/hooks";
import { Num, TraderCell } from "@/components/app";

export function HomeStats() {
  const t = useTranslations("home");
  const f = useFmt();
  const { data } = useQuery({ queryKey: ["market-stats"], queryFn: () => get<MarketStatsDto>("/market/stats"), refetchInterval: 30_000 });
  const items = [
    [t("statBestBuy"), data ? f.price(data.bestSellPriceIls) : null],
    [t("statBestSell"), data ? f.price(data.bestBuyPriceIls) : null],
    [t("statOffers"), data ? String(data.activeOffers) : null],
    [t("statVolume"), data ? `${f.usdt(data.volume24hUsdt)} USDT` : null],
  ];
  return (
    <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-subtle">{label}</dt>
          <dd className="mt-1 text-lg font-semibold text-fg">{value === null ? <Skeleton className="h-6 w-20" /> : <Num>{value}</Num>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LiveOffers() {
  const t = useTranslations();
  const f = useFmt();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["offers", "home"], queryFn: () => get<Paginated<OfferDto>>("/offers?side=SELL&limit=5&sort=price") });
  useRealtime({ "offer.updated": () => qc.invalidateQueries({ queryKey: ["offers", "home"] }) }, [qc]);
  return (
    <Card className="self-start overflow-hidden animate-rise [animation-delay:120ms]">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <p className="text-sm font-semibold text-fg">{t("home.liveOffers")}</p>
        <Badge tone="accent" dot>
          {t("market.live")}
        </Badge>
      </div>
      <ul className="divide-y divide-border">
        {isLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="px-5 py-4">
              <Skeleton className="h-9 w-full" />
            </li>
          ))}
        {data?.items.map((o) => (
          <li key={o.id}>
            <Link href={`/offers/${o.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-surface-2">
              <TraderCell trader={o.owner} compact />
              <div className="text-end">
                <p className="text-[15px] font-semibold text-fg">
                  <Num>{f.price(o.priceIls)}</Num>
                </p>
                <p className="text-xs text-muted">
                  <Num>{f.usdt(o.remainingUsdt)}</Num> USDT
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/market" className="block border-t border-border px-5 py-3 text-center text-sm font-semibold text-accent-strong hover:bg-surface-2">
        {t("common.viewAll")}
      </Link>
    </Card>
  );
}
