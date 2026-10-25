import { createContext, useContext, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { palette, radius, type Palette } from "@wasitx/tokens";
import { useLocale } from "@/lib/i18n";

const ThemeCtx = createContext<Palette>(palette.dark);
export const useTheme = () => useContext(ThemeCtx);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  return <ThemeCtx.Provider value={scheme === "light" ? palette.light : palette.dark}>{children}</ThemeCtx.Provider>;
}

/** Root of every screen: safe area, background, and RTL/LTR direction for the current language. */
export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const c = useTheme();
  const { rtl } = useLocale();
  const inner = <View style={[{ direction: rtl ? "rtl" : "ltr", gap: 14 }, padded && { padding: 16 }]}>{children}</View>;
  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: c.bg, direction: rtl ? "rtl" : "ltr" }}>
      {scroll ? <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">{inner}</ScrollView> : <View style={{ flex: 1 }}>{inner}</View>}
    </SafeAreaView>
  );
}

type TextVariant = "h1" | "h2" | "body" | "muted" | "small" | "label" | "num";
export function T({ children, v = "body", style, numberOfLines }: { children: ReactNode; v?: TextVariant; style?: TextStyle; numberOfLines?: number }) {
  const c = useTheme();
  const { rtl } = useLocale();
  const base: Record<TextVariant, TextStyle> = {
    h1: { fontSize: 26, fontWeight: "700", color: c.text },
    h2: { fontSize: 18, fontWeight: "600", color: c.text },
    body: { fontSize: 15, color: c.text },
    muted: { fontSize: 14, color: c.muted },
    small: { fontSize: 12, color: c.subtle },
    label: { fontSize: 13, fontWeight: "500", color: c.text },
    num: { fontSize: 15, fontWeight: "600", color: c.text, fontVariant: ["tabular-nums"], writingDirection: "ltr" },
  };
  return (
    <Text numberOfLines={numberOfLines} style={[base[v], { textAlign: v === "num" ? undefined : rtl ? "right" : "left", writingDirection: v === "num" ? "ltr" : rtl ? "rtl" : "ltr" }, style]}>
      {children}
    </Text>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = useTheme();
  return <View style={[{ backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.lg, padding: 16, gap: 10 }, style]}>{children}</View>;
}

export function Button({ title, onPress, variant = "primary", loading, disabled, icon }: { title: string; onPress?: () => void; variant?: "primary" | "outline" | "danger" | "ghost"; loading?: boolean; disabled?: boolean; icon?: ReactNode }) {
  const c = useTheme();
  const bg = variant === "primary" ? c.accent : variant === "danger" ? c.danger : "transparent";
  const fg = variant === "primary" ? c.accentFg : variant === "danger" ? "#fff" : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        { height: 50, borderRadius: radius.md, backgroundColor: bg, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 16 },
        variant === "outline" && { borderWidth: 1, borderColor: c.borderStrong },
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon}
      <Text style={{ color: fg, fontWeight: "700", fontSize: 15 }}>{title}</Text>
    </Pressable>
  );
}

export function Input({ label, error, hint, ltr, ...p }: TextInputProps & { label: string; error?: string; hint?: string; ltr?: boolean }) {
  const c = useTheme();
  const { rtl } = useLocale();
  return (
    <View style={{ gap: 6 }}>
      <T v="label">{label}</T>
      <TextInput
        placeholderTextColor={c.subtle}
        accessibilityLabel={label}
        style={{ height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: error ? c.danger : c.borderStrong, backgroundColor: c.surface2, color: c.text, paddingHorizontal: 14, fontSize: 16, textAlign: ltr ? "left" : rtl ? "right" : "left", writingDirection: ltr ? "ltr" : rtl ? "rtl" : "ltr" }}
        {...p}
      />
      {error ? <T v="small" style={{ color: c.danger }}>{error}</T> : hint ? <T v="small">{hint}</T> : null}
    </View>
  );
}

export function Badge({ text, tone = "neutral" }: { text: string; tone?: "neutral" | "success" | "warning" | "danger" | "info" | "accent" }) {
  const c = useTheme();
  const color = { neutral: c.muted, success: c.success, warning: c.warning, danger: c.danger, info: c.info, accent: c.accentStrong }[tone];
  return (
    <View style={{ alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99, backgroundColor: `${color}26` }}>
      <Text style={{ color, fontSize: 12, fontWeight: "700" }}>{text}</Text>
    </View>
  );
}

export function Row({ k, v, strong }: { k: string; v: ReactNode; strong?: boolean }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border, gap: 12 }}>
      <T v="muted">{k}</T>
      {typeof v === "string" ? <T v="num" style={strong ? { fontWeight: "700" } : { fontWeight: "500" }}>{v}</T> : v}
    </View>
  );
}

export function Notice({ text, tone = "info" }: { text: string; tone?: "info" | "warning" | "danger" | "success" }) {
  const c = useTheme();
  const color = { info: c.info, warning: c.warning, danger: c.danger, success: c.success }[tone];
  return (
    <View accessibilityRole="alert" style={{ borderRadius: radius.md, padding: 12, backgroundColor: `${color}1F`, borderWidth: 1, borderColor: `${color}55` }}>
      <T v="body" style={{ fontSize: 14 }}>{text}</T>
    </View>
  );
}

export function Loading() {
  const c = useTheme();
  return <View style={{ padding: 40, alignItems: "center" }}><ActivityIndicator color={c.accent} /></View>;
}

export function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const c = useTheme();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: value ? c.accent : c.borderStrong, backgroundColor: value ? c.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
        {value && <Text style={{ color: c.accentFg, fontWeight: "900", fontSize: 13 }}>✓</Text>}
      </View>
      <T v="body" style={{ flex: 1 }}>{label}</T>
    </Pressable>
  );
}

export function Segmented<V extends string>({ value, onChange, items }: { value: V; onChange: (v: V) => void; items: { value: V; label: string }[] }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: "row", backgroundColor: c.surface2, borderRadius: radius.md, padding: 4, borderWidth: 1, borderColor: c.border }}>
      {items.map((it) => (
        <Pressable key={it.value} accessibilityRole="tab" accessibilityState={{ selected: value === it.value }} onPress={() => onChange(it.value)} style={{ flex: 1, paddingVertical: 10, borderRadius: radius.sm, backgroundColor: value === it.value ? c.surface : "transparent", alignItems: "center" }}>
          <Text style={{ color: value === it.value ? c.text : c.muted, fontWeight: "700", fontSize: 14 }}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "info" | "accent"> = {
  COMPLETED: "success", CANCELLED: "neutral", EXPIRED: "neutral", DISPUTED: "danger", FROZEN: "danger", AWAITING_FIAT_PAYMENT: "warning", COMPLIANCE_REVIEW: "warning",
};
export const statusTone = (s: string) => STATUS_TONE[s] ?? "info";
