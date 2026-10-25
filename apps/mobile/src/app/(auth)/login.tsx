import { useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { Button, Input, Notice, Screen, T, useTheme } from "@/components/ui";
import { ApiError, BRAND, login } from "@/lib/api";
import { useErrorText } from "@/lib/i18n";
import { LanguagePicker } from "@/components/language-picker";

export default function Login() {
  const t = useTranslations();
  const err = useErrorText();
  const qc = useQueryClient();
  const c = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [mfa, setMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await login(email.trim().toLowerCase(), password, mfa ? totp : undefined);
      await qc.invalidateQueries({ queryKey: ["me"] });
    } catch (e) {
      if (e instanceof ApiError && e.code === "MFA_REQUIRED") setMfa(true);
      else setError(err(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ paddingTop: 60, alignItems: "center", gap: 8 }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }}>
          <T v="h1" style={{ color: c.accentFg }}>W</T>
        </View>
        <T v="h2">{BRAND}</T>
      </View>
      <LanguagePicker />
      <T v="h1">{mfa ? t("auth.mfaTitle") : t("auth.loginTitle")}</T>
      <T v="muted">{mfa ? t("auth.mfaSubtitle") : t("auth.loginSubtitle")}</T>
      {error && <Notice tone="danger" text={error} />}
      {!mfa ? (
        <>
          <Input label={t("auth.email")} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" ltr />
          <Input label={t("auth.password")} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
        </>
      ) : (
        <Input label={t("auth.mfaCode")} value={totp} onChangeText={(v) => setTotp(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" ltr />
      )}
      <Button title={mfa ? t("auth.verify") : t("auth.loginTitle")} onPress={submit} loading={busy} />
      <Link href="/(auth)/register" asChild>
        <Pressable accessibilityRole="link"><T v="muted" style={{ textAlign: "center" }}>{t("auth.noAccount")} <T v="label" style={{ color: c.accentStrong }}>{t("auth.registerTitle")}</T></T></Pressable>
      </Link>
      <T v="small" style={{ textAlign: "center" }}>{t("common.sandboxBanner")}</T>
    </Screen>
  );
}
