import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { registerSchema } from "@wasitx/shared";
import { Button, Check, Input, Notice, Screen, T } from "@/components/ui";
import { register } from "@/lib/api";
import { useErrorText, useLocale } from "@/lib/i18n";
import { LanguagePicker } from "@/components/language-picker";

export default function Register() {
  const t = useTranslations();
  const err = useErrorText();
  const qc = useQueryClient();
  const { locale } = useLocale();
  const [f, setF] = useState({ displayName: "", email: "", password: "", acceptTerms: false, confirmAge: false });
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fe = (k: string) => (fieldErr[k] ? (t.has(`errors.${fieldErr[k]}` as never) ? t(`errors.${fieldErr[k]}` as never) : t("common.required")) : undefined);

  const submit = async () => {
    const parsed = registerSchema.safeParse({ ...f, email: f.email.trim(), locale });
    if (!parsed.success) return setFieldErr(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
    setFieldErr({});
    setBusy(true);
    setError(null);
    try {
      await register(parsed.data);
      await qc.invalidateQueries({ queryKey: ["me"] });
      router.replace("/verify");
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <LanguagePicker />
      <T v="h1" style={{ marginTop: 24 }}>{t("auth.registerTitle")}</T>
      <T v="muted">{t("auth.registerSubtitle")}</T>
      {error && <Notice tone="danger" text={error} />}
      <Input label={t("auth.displayName")} hint={t("auth.displayNameHint")} error={fe("displayName")} value={f.displayName} onChangeText={(v) => setF({ ...f, displayName: v })} />
      <Input label={t("auth.email")} error={fe("email")} value={f.email} onChangeText={(v) => setF({ ...f, email: v })} autoCapitalize="none" keyboardType="email-address" ltr />
      <Input label={t("auth.password")} hint={t("auth.passwordHint")} error={fe("password")} value={f.password} onChangeText={(v) => setF({ ...f, password: v })} secureTextEntry />
      <Check label={t("auth.acceptTerms")} value={f.acceptTerms} onChange={(v) => setF({ ...f, acceptTerms: v })} />
      <Check label={t("auth.confirmAge")} value={f.confirmAge} onChange={(v) => setF({ ...f, confirmAge: v })} />
      <Button title={t("nav.register")} onPress={submit} loading={busy} />
      <Button title={t("common.back")} variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
