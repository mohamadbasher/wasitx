import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import type { NotificationDto, Paginated } from "@wasitx/shared";
import { Button, Card, Loading, Screen, T, useTheme } from "@/components/ui";
import { get, post } from "@/lib/api";
import { fmt, useLocale } from "@/lib/i18n";

export default function Notifications() {
  const t = useTranslations("notifications");
  const c = useTheme();
  const { locale } = useLocale();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => get<Paginated<NotificationDto> & { unread: number }>("/notifications") });
  return (
    <Screen>
      <Button title={t("markAll")} variant="outline" onPress={async () => { await post("/notifications/read", {}); qc.invalidateQueries({ queryKey: ["notifications"] }); }} />
      {!q.data ? <Loading /> : q.data.items.length === 0 ? <T v="muted">{t("empty")}</T> : q.data.items.map((n) => (
        <Pressable key={n.id} onPress={() => { const m = /^\/trades\/([\w-]+)/.exec(n.link ?? ""); if (m) router.push(`/trade/${m[1]}`); }}>
          <Card style={!n.readAt ? { borderColor: c.accent } : undefined}>
            <View style={{ gap: 4 }}>
              <T v="label">{n.title}</T>
              <T v="muted">{n.body}</T>
              <T v="small">{fmt.dateTime(n.createdAt, locale)}</T>
            </View>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
