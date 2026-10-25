import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useTranslations } from "use-intl";
import { Badge, Button, Card, Notice, Row, Screen, T } from "@/components/ui";
import { get, post, tokens } from "@/lib/api";
import { fmt, useLocale } from "@/lib/i18n";
import { useMe } from "@/lib/session";

export default function Security() {
  const t = useTranslations();
  const { locale } = useLocale();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => get<{ id: string; current: boolean; device: string; lastUsedAt: string }[]>("/auth/sessions") });
  if (!me) return null;
  return (
    <Screen>
      <Card>
        <T v="h2">{t("security.mfa")}</T>
        <Badge text={me.mfaEnabled ? t("security.mfaOn") : t("security.mfaOff")} tone={me.mfaEnabled ? "success" : "warning"} />
        {!me.mfaEnabled && <Notice text={t("wallet.withdrawNeedsMfa")} />}
        <T v="small">{t("security.passkeysSoon")}</T>
      </Card>
      <Card>
        <T v="h2">{t("security.sessions")}</T>
        {sessions.data?.map((s) => <Row key={s.id} k={s.device.slice(0, 32)} v={s.current ? t("security.current") : fmt.dateTime(s.lastUsedAt, locale)} />)}
        <Button title={t("security.logoutAll")} variant="outline" onPress={async () => {
          await post("/auth/logout-all");
          await tokens.clear();
          qc.clear();
          router.replace("/(auth)/login");
        }} />
      </Card>
    </Screen>
  );
}
