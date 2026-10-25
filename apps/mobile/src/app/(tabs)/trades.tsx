import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { useTranslations } from "use-intl";
import type { Paginated, TradeDto } from "@wasitx/shared";
import { Badge, Loading, Segmented, T, statusTone, useTheme } from "@/components/ui";
import { get } from "@/lib/api";
import { fmt, useLocale } from "@/lib/i18n";

type Scope = "active" | "completed" | "cancelled";

export default function Trades() {
  const t = useTranslations();
  const c = useTheme();
  const { rtl, locale } = useLocale();
  const [scope, setScope] = useState<Scope>("active");
  const q = useQuery({ queryKey: ["trades", scope], queryFn: () => get<Paginated<TradeDto>>(`/trades?scope=${scope}&limit=50`), refetchInterval: 20_000 });
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, direction: rtl ? "rtl" : "ltr" }}>
      <View style={{ padding: 16 }}>
        <Segmented value={scope} onChange={setScope} items={(["active", "completed", "cancelled"] as const).map((s) => ({ value: s, label: t(`trade.scope_${s}`) }))} />
      </View>
      {q.isLoading ? <Loading /> : (
        <FlatList
          data={q.data?.items ?? []}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 10 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={c.accent} />}
          ListEmptyComponent={<T v="muted" style={{ textAlign: "center", padding: 32 }}>{t("trade.empty")}</T>}
          renderItem={({ item: tr }) => (
            <Pressable accessibilityRole="button" onPress={() => router.push(`/trade/${tr.id}`)} style={{ backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14, gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Badge text={t(`trade.role_${tr.myRole === "seller" ? "seller" : "buyer"}`)} tone={tr.myRole === "seller" ? "info" : "accent"} />
                <Badge text={t(`status.${tr.status}`)} tone={statusTone(tr.status)} />
              </View>
              <T v="num">{fmt.usdt(tr.amountUsdt)} USDT · {fmt.ils(tr.fiatAmountIls)}</T>
              <T v="small">{tr.reference} · {fmt.dateTime(tr.createdAt, locale)}{tr.unreadMessages ? ` · ●` : ""}</T>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
