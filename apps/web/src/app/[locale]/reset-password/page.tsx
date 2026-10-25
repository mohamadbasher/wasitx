"use client";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Alert, Button, Field, Input } from "@wasitx/ui";
import { password as passwordSchema } from "@wasitx/shared";
import { AuthShell } from "@/components/auth-shell";
import { Link } from "@/i18n/navigation";
import { post } from "@/lib/api";
import { useErrorText } from "@/lib/hooks";

function ResetInner() {
  const t = useTranslations();
  const err = useErrorText();
  const token = useSearchParams().get("token");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    setLoading(true);
    try {
      await fn();
      setDone(true);
    } catch (e) {
      setError(err(e));
    } finally {
      setLoading(false);
    }
  };

  if (token) {
    const pwCheck = pw ? passwordSchema.safeParse(pw) : null;
    return (
      <AuthShell title={t("auth.resetTitle")}>
        {done ? (
          <>
            <Alert tone="success">{t("auth.resetDone")}</Alert>
            <Link href="/login" className="mt-4 block"><Button block>{t("nav.login")}</Button></Link>
          </>
        ) : (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void run(() => post("/auth/password/reset", { token, password: pw })); }}>
            {error && <Alert tone="danger">{error}</Alert>}
            <Field label={t("auth.newPassword")} hint={t("auth.passwordHint")} htmlFor="pw" error={pwCheck && !pwCheck.success ? t(`errors.${pwCheck.error.issues[0]!.message}` as never) : undefined}>
              <Input id="pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </Field>
            <Button type="submit" block size="lg" loading={loading} disabled={!pwCheck?.success}>{t("auth.setPassword")}</Button>
          </form>
        )}
      </AuthShell>
    );
  }
  return (
    <AuthShell title={t("auth.resetTitle")} subtitle={t("auth.resetSubtitle")}>
      {done ? (
        <Alert tone="success">{t("auth.resetSent")}</Alert>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void run(() => post("/auth/password/forgot", { email })); }}>
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label={t("auth.email")} htmlFor="email">
            <Input id="email" type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" block size="lg" loading={loading}>{t("common.continue")}</Button>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPage() {
  return (
    <Suspense>
      <ResetInner />
    </Suspense>
  );
}
