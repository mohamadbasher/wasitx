import { Pressable, View } from "react-native";
import { LOCALES, type Locale } from "@wasitx/shared";
import { T, useTheme } from "@/components/ui";
import { useLocale } from "@/lib/i18n";

const LANG: Record<Locale, string> = { ar: "العربية", he: "עברית", en: "English" };

export function LanguagePicker() {
  const { locale, setLocale } = useLocale();
  const c = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
      {LOCALES.map((l) => (
        <Pressable key={l} accessibilityRole="button" onPress={() => setLocale(l)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: locale === l ? c.accent : c.border }}>
          <T v="small" style={{ color: locale === l ? c.accentStrong : c.muted, fontWeight: "600" }}>{LANG[l]}</T>
        </Pressable>
      ))}
    </View>
  );
}
