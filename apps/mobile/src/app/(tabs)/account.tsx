import { useQueryClient } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { Badge, Button, Card, Screen, T, useTheme } from "@/components/ui";
import { LanguagePicker } from "@/components/language-picker";
import { post, tokens } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import { useMe } from "@/lib/session";

export default function Account() {
  const t = useTranslations();
  const c = useTheme();
  const { rtl } = useLocale();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const Chevron = rtl ? ChevronLeft : ChevronRight;
  if (!me) return null;
  const links: [string, Href][] = [
    [t("onboarding.title"), "/verify"],
    [t("nav.bankAccounts"), "/bank-accounts"],
    [t("nav.notifications"), "/notifications"],
    [t("nav.security"), "/security"],
  ];
  return (
    <Screen>
      <Card>
        <T v="h2">{me.displayName}</T>
        <T v="muted">{me.email}</T>
        <Badge text={t(`dashboard.tier_${me.tier}`)} tone={me.tier === "VERIFIED_TRADER" ? "success" : "warning"} />
      </Card>
      <Card style={{ padding: 0, gap: 0 }}>
        {links.map(([label, href], i) => (
          <Pressable key={label} accessibilityRole="link" onPress={() => router.push(href)} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
            <T v="body">{label}</T>
            <Chevron color={c.subtle} size={18} />
          </Pressable>
        ))}
      </Card>
      <View style={{ gap: 8 }}>
        <T v="label">{t("common.language")}</T>
        <LanguagePicker />
      </View>
      <Button title={t("nav.logout")} variant="outline" onPress={async () => {
        await post("/auth/logout").catch(() => undefined);
        await tokens.clear();
        qc.clear();
        router.replace("/(auth)/login");
      }} />
    </Screen>
  );
}
