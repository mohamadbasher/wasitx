"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Alert, Button, Checkbox, Field, Input } from "@wasitx/ui";
import { registerSchema } from "@wasitx/shared";
import { AuthShell } from "@/components/auth-shell";
import { Link, useRouter } from "@/i18n/navigation";
import { post } from "@/lib/api";
import { useErrorText } from "@/lib/hooks";

export default function RegisterPage() {
  const t = useTranslations();
  const locale = useLocale();
  const err = useErrorText();
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState({ email: "", password: "", displayName: "", acceptTerms: false, confirmAge: false });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fe = (k: string) => (fieldErrors[k] ? (t.has(`errors.${fieldErrors[k]}` as never) ? t(`errors.${fieldErrors[k]}` as never) : fieldErrors[k]) : undefined);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = registerSchema.safeParse({ ...form, locale });
    if (!parsed.success) {
      setFieldErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setFieldErrors({});
    setLoading(true);
    try {
      await post("/auth/register", parsed.data);
      await qc.invalidateQueries({ queryKey: ["me"] });
      router.replace("/verify-email");
    } catch (e) {
      setError(err(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={t("auth.registerTitle")}
      subtitle={t("auth.registerSubtitle")}
      footer={
        <>
          {t("auth.haveAccount")}{" "}
          <Link href="/login" className="font-semibold text-accent-strong hover:underline">
            {t("nav.login")}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label={t("auth.displayName")} hint={t("auth.displayNameHint")} error={fe("displayName")} htmlFor="dn">
          <Input id="dn" autoComplete="nickname" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} aria-invalid={!!fe("displayName")} />
        </Field>
        <Field label={t("auth.email")} error={fe("email")} htmlFor="email">
          <Input id="email" type="email" dir="ltr" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} aria-invalid={!!fe("email")} />
        </Field>
        <Field label={t("auth.password")} hint={t("auth.passwordHint")} error={fe("password")} htmlFor="pw">
          <Input id="pw" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} aria-invalid={!!fe("password")} />
        </Field>
        <div className="space-y-2.5 pt-1">
          <Checkbox
            checked={form.acceptTerms}
            onChange={(e) => setForm({ ...form, acceptTerms: e.target.checked })}
            label={
              <>
                {t("auth.acceptTerms")} (
                <Link href="/legal/terms" className="text-accent-strong hover:underline">{t("footer.terms")}</Link>,{" "}
                <Link href="/legal/privacy" className="text-accent-strong hover:underline">{t("footer.privacy")}</Link>)
              </>
            }
          />
          {fe("acceptTerms") && <p className="text-xs text-danger">{fe("acceptTerms")}</p>}
          <Checkbox checked={form.confirmAge} onChange={(e) => setForm({ ...form, confirmAge: e.target.checked })} label={t("auth.confirmAge")} />
          {fe("confirmAge") && <p className="text-xs text-danger">{fe("confirmAge")}</p>}
        </div>
        <Button type="submit" block size="lg" loading={loading}>
          {t("nav.register")}
        </Button>
      </form>
    </AuthShell>
  );
}
