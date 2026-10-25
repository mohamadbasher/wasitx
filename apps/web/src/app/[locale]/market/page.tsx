"use client";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, SearchX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Badge, Button, Card, Checkbox, EmptyState, ErrorState, Input, Select, Skeleton, Tabs } from "@wasitx/ui";
import { OFFER_SORTS, type OfferDto, type Paginated } from "@wasitx/shared";
import { Container, Num, PageHeader, TraderCell } from "@/components/app";
import { Link, useRouter } from "@/i18n/navigation";
import { get } from "@/lib/api";
import { useFmt, useMe, usePublicConfig, useRealtime } from "@/lib/hooks";

type Side = "SELL" | "BUY";

function MarketInner() {
  const t = useTranslations();
  const f = useFmt();
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: config } = usePublicConfig();

  const [side, setSide] = useState<Side>(params.get("side") === "BUY" ? "BUY" : "SELL");
  const [amount, setAmount] = useState("");
  const [debounced, setDebounced] = useState("");
  const [pm, setPm] = useState("");
  const [sort, setSort] = useState<(typeof OFFER_SORTS)[number]>("price");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  useEffect(() => {
    const h = setTimeout(() => setDebounced(/^\d+(\.\d{1,2})?$/.test(amount) ? amount : ""), 350);
    return () => clearTimeout(h);
  }, [amount]);

  const key = ["offers", side, debounced, pm, sort, verifiedOnly];
  const q = useInfiniteQuery({
    queryKey: key,
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) => {
      const sp = new URLSearchParams({ side, sort, limit: "15" });
      if (debounced) sp.set("amountIls", debounced);
      if (pm) sp.set("paymentMethod", pm);
      if (verifiedOnly) sp.set("verifiedOnly", "true");
      if (pageParam) sp.set("cursor", pageParam);
      return get<Paginated<OfferDto>>(`/offers?${sp}`, signal);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  useRealtime({ "offer.updated": () => qc.invalidateQueries({ queryKey: ["offers", side] }) }, [qc, side]);

  const offers = q.data?.pages.flatMap((p) => p.items) ?? [];
  const actionLabel = side === "SELL" ? t("market.buyAction") : t("market.sellAction");
  const changeSide = (s: Side) => {
    setSide(s);
    router.replace(`/market?side=${s}`, { scroll: false });
  };

  return (
    <Container>
      <PageHeader
        title={t("market.title")}
        subtitle={t("market.subtitle")}
        action={
          me && (
            <Link href="/offers/new">
              <Button>
                <Plus className="size-4" /> {t("market.newOffer")}
              </Button>
            </Link>
          )
        }
      />

      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <Tabs value={side} onChange={changeSide} items={[{ value: "SELL", label: t("market.tabBuy") }, { value: "BUY", label: t("market.tabSell") }]} />
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <label className="col-span-2 sm:w-44">
            <span className="mb-1 block text-xs text-muted">{t("market.amountFilter")}</span>
            <Input inputMode="decimal" placeholder="1,000" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
          </label>
          <label className="sm:w-48">
            <span className="mb-1 block text-xs text-muted">{t("market.paymentFilter")}</span>
            <Select value={pm} onChange={(e) => setPm(e.target.value)}>
              <option value="">{t("common.all")}</option>
              {config?.paymentMethods.filter((m) => m.enabled).map((m) => (
                <option key={m.code} value={m.code}>
                  {t(`enums.pm_${m.code}`)}
                </option>
              ))}
            </Select>
          </label>
          <label className="sm:w-48">
            <span className="mb-1 block text-xs text-muted">{t("market.sort")}</span>
            <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              {OFFER_SORTS.map((s) => (
                <option key={s} value={s}>
                  {t(`market.sort_${s}`)}
                </option>
              ))}
            </Select>
          </label>
          <Checkbox className="col-span-2 sm:mb-3" label={t("market.verifiedOnly")} checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />
        </div>
      </div>

      <Card className="overflow-hidden">
        {q.isError ? (
          <ErrorState title={t("common.errorTitle")} body={t("common.errorBody")} onRetry={() => q.refetch()} retryLabel={t("common.retry")} />
        ) : q.isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="size-10 rounded-full" />
                <Skeleton className="h-5 flex-1" />
                <Skeleton className="h-9 w-24" />
              </div>
            ))}
          </div>
        ) : offers.length === 0 ? (
          <EmptyState icon={<SearchX className="size-5" />} title={t("market.empty")} />
        ) : (
          <>
            {/* desktop table */}
            <table className="hidden w-full text-sm md:table">
              <thead className="border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-5 py-3 text-start font-medium">{t("market.trader")}</th>
                  <th className="px-5 py-3 text-start font-medium">{t("market.price")}</th>
                  <th className="px-5 py-3 text-start font-medium">{t("market.available")}</th>
                  <th className="px-5 py-3 text-start font-medium">{t("market.limits")}</th>
                  <th className="px-5 py-3 text-start font-medium">{t("market.payment")}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {offers.map((o) => (
                  <tr key={o.id} className="transition-colors hover:bg-surface-2/60">
                    <td className="px-5 py-4">
                      <TraderCell trader={o.owner} />
                    </td>
                    <td className="px-5 py-4 text-base font-semibold text-fg">
                      <Num>{f.price(o.priceIls)}</Num>
                    </td>
                    <td className="px-5 py-4 text-fg">
                      <Num>{f.usdt(o.remainingUsdt)}</Num> <span className="text-muted">USDT</span>
                    </td>
                    <td className="px-5 py-4 text-muted">
                      <Num>
                        {f.ils(o.minOrderIls)} – {f.ils(o.maxOrderIls)}
                      </Num>
                    </td>
                    <td className="px-5 py-4">
                      <Badge>{t(`enums.pm_${o.paymentMethod}`)}</Badge>
                    </td>
                    <td className="px-5 py-4 text-end">
                      <Link href={`/offers/${o.id}`}>
                        <Button size="sm" variant={o.isMine ? "outline" : side === "SELL" ? "primary" : "danger"}>
                          {o.isMine ? t("offer.ownOffer") : `${actionLabel} USDT`}
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* mobile cards */}
            <ul className="divide-y divide-border md:hidden">
              {offers.map((o) => (
                <li key={o.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <TraderCell trader={o.owner} compact />
                    <p className="text-lg font-bold text-fg">
                      <Num>{f.price(o.priceIls)}</Num>
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>
                      {t("market.available")}: <Num className="text-fg">{f.usdt(o.remainingUsdt)}</Num> USDT
                    </span>
                    <Badge>{t(`enums.pm_${o.paymentMethod}`)}</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted">
                      <Num>
                        {f.ils(o.minOrderIls)} – {f.ils(o.maxOrderIls)}
                      </Num>
                    </span>
                    <Link href={`/offers/${o.id}`}>
                      <Button size="sm" variant={side === "SELL" ? "primary" : "danger"}>
                        {actionLabel}
                      </Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      {q.hasNextPage && (
        <div className="mt-5 text-center">
          <Button variant="outline" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
            {t("common.loadMore")}
          </Button>
        </div>
      )}
    </Container>
  );
}

export default function MarketPage() {
  return (
    <Suspense>
      <MarketInner />
    </Suspense>
  );
}
