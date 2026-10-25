import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import { ThemeProvider, useTheme } from "@/components/ui";
import { I18nProvider } from "@/lib/i18n";
import { useMe, usePushRegistration } from "@/lib/session";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

function Gate() {
  const c = useTheme();
  const t = useTranslations();
  const segments = useSegments();
  const { data: me, isLoading } = useMe();
  usePushRegistration(!!me);

  useEffect(() => {
    if (isLoading) return;
    const inAuth = segments[0] === "(auth)";
    if (!me && !inAuth) router.replace("/(auth)/login");
    if (me && inAuth) router.replace("/(tabs)/market");
  }, [me, isLoading, segments]);

  // Deep-link from a tapped push notification (link is a web path like /trades/<id>).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const link = String(r.notification.request.content.data?.link ?? "");
      const m = /^\/trades\/([\w-]+)/.exec(link);
      if (m) router.push(`/trade/${m[1]}`);
    });
    return () => sub.remove();
  }, []);

  const header = { headerStyle: { backgroundColor: c.surface }, headerTintColor: c.text, headerShadowVisible: false, contentStyle: { backgroundColor: c.bg } };
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={header}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="offer/[id]" options={{ title: t("offer.detailsTitle") }} />
        <Stack.Screen name="trade/[id]" options={{ title: t("nav.trades") }} />
        <Stack.Screen name="verify" options={{ title: t("onboarding.title") }} />
        <Stack.Screen name="notifications" options={{ title: t("notifications.title") }} />
        <Stack.Screen name="security" options={{ title: t("security.title") }} />
        <Stack.Screen name="bank-accounts" options={{ title: t("bank.title") }} />
        <Stack.Screen name="offer-new" options={{ title: t("offer.createTitle") }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } }));
  return (
    <QueryClientProvider client={client}>
      <I18nProvider>
        <ThemeProvider>
          <Gate />
        </ThemeProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
