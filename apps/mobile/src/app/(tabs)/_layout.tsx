import { Tabs } from "expo-router";
import { ArrowLeftRight, CircleUser, Store, Wallet } from "lucide-react-native";
import { useTranslations } from "use-intl";
import { useTheme } from "@/components/ui";

export default function TabsLayout() {
  const t = useTranslations("nav");
  const c = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.surface },
        headerTintColor: c.text,
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        tabBarActiveTintColor: c.accentStrong,
        tabBarInactiveTintColor: c.subtle,
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="market" options={{ title: t("market"), tabBarIcon: ({ color, size }) => <Store color={color} size={size} /> }} />
      <Tabs.Screen name="trades" options={{ title: t("trades"), tabBarIcon: ({ color, size }) => <ArrowLeftRight color={color} size={size} /> }} />
      <Tabs.Screen name="wallet" options={{ title: t("wallet"), tabBarIcon: ({ color, size }) => <Wallet color={color} size={size} /> }} />
      <Tabs.Screen name="account" options={{ title: t("account"), tabBarIcon: ({ color, size }) => <CircleUser color={color} size={size} /> }} />
    </Tabs>
  );
}
