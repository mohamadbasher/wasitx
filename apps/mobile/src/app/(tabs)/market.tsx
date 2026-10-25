import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { ShieldCheck } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { useTranslations } from "use-intl";
import type { OfferDto, Paginated } from "@wasitx/shared";
import { Badge, Button, Loading, Segmented, T, useTheme } from "@/components/ui";
import { get } from "@/lib/api";
import { fmt, useLocale } from "@/lib/i18n";
import { getSocket } from "@/lib/session";

export default function Market() {
  const t = useTranslations();
  const c = useTheme();
  const { rtl } = useLocale();
  const qc = useQueryClient();
  const [side, setSide] = useState<"SELL" | "BUY">("SELL");
  const q = useInfiniteQuery({
    queryKey: ["offers", side],
    initialPageParam: "",
    queryFn: ({ pageParam }) => get<Paginated<OfferDto>>(`/offers?side=${side}&sort=price&limit=20${pageParam ? `&cursor=${pageParam}` : ""}`),
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  useEffect(() => {
    let off = () => undefined as void;
    void getSocket().then((s) => {
      const h = () => qc.invalidateQueries({ queryKey: ["offers"] });
      s.on("offer.updated", h);
      off = () => void s.off("offer.updated", h);
    });
    return () => off();
  }, [qc]);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, direction: rtl ? "rtl" : "ltr" }}>
      <View style={{ padding: 16, gap: 12 }}>
        <Segmented value={side} onChange={setSide} items={[{ value: "SELL", label: t("market.tabBuy") }, { value: "BUY", label: t("market.tabSell") }]} />
        <Button title={t("market.newOffer")} variant="outline" onPress={() => router.push("/offer-new")} />
      </View>
      {q.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 10 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={c.accent} />}
          onEndReached={() => q.hasNextPage && q.fetchNextPage()}
          ListEmptyComponent={<T v="muted" style={{ textAlign: "center", padding: 32 }}>{t("market.empty")}</T>}
          renderItem={({ item: o }) => (
            <Pressable accessibilityRole="button" onPress={() => router.push(`/offer/${o.id}`)} style={({ pressed }) => ({ backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14, gap: 10, opacity: pressed ? 0.8 : 1 })}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <T v="label">{o.owner.displayName}</T>
                  {o.owner.verified && <ShieldCheck color={c.accent} size={14} />}
                </View>
                <T v="num" style={{ fontSize: 20, fontWeight: "700" }}>{fmt.price(o.priceIls)}</T>
              </View>
              <T v="small">{t("common.trades", { count: o.owner.completedTrades })}{o.owner.completionRate ? ` · ${t("market.completion", { rate: o.owner.completionRate })}` : ""}</T>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <T v="small">{t("market.available")}: {fmt.usdt(o.remainingUsdt)} USDT</T>
                <Badge text={t(`enums.pm_${o.paymentMethod}`)} />
              </View>
              <T v="small">{t("market.limits")}: {fmt.ils(o.minOrderIls)} – {fmt.ils(o.maxOrderIls)}</T>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
