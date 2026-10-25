"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Alert, Button, Field, Input } from "@wasitx/ui";
import { AuthShell } from "@/components/auth-shell";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError, post } from "@/lib/api";
import { useErrorText } from "@/lib/hooks";

function LoginInner() {
  const t = useTranslations("auth");
  const err = useErrorText();
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfa, setMfa] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const next = params.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next.replace(/^\/(ar|he|en)(?=\/|$)/, "") || "/dashboard" : "/dashboard";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await post("/auth/login", { email, password, ...(mfa ? (recovery ? { recoveryCode: code } : { totp: code }) : {}) });
      await qc.invalidateQueries();
      router.replace(safeNext);
    } catch (e) {
      if (e instanceof ApiError && e.code === "MFA_REQUIRED") {
        setMfa(true);
      } else {
        setError(err(e));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={mfa ? t("mfaTitle") : t("loginTitle")}
      subtitle={mfa ? t("mfaSubtitle") : t("loginSubtitle")}
      footer={
        !mfa && (
          <>
            {t("noAccount")}{" "}
            <Link href="/register" className="font-semibold text-accent-strong hover:underline">
              {t("registerTitle")}
            </Link>
          </>
        )
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        {!mfa ? (
          <>
            <Field label={t("email")} htmlFor="email">
              <Input id="email" type="email" autoComplete="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label={t("password")} htmlFor="password">
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <div className="text-end">
              <Link href="/reset-password" className="text-sm font-medium text-accent-strong hover:underline">
                {t("forgot")}
              </Link>
            </div>
          </>
        ) : (
          <>
            <Field label={recovery ? t("recoveryCode") : t("mfaCode")} htmlFor="code">
              <Input id="code" autoFocus inputMode={recovery ? "text" : "numeric"} autoComplete="one-time-code" dir="ltr" className="text-center font-mono text-lg tracking-[0.4em]" maxLength={recovery ? 12 : 6} value={code} onChange={(e) => setCode(e.target.value.trim())} />
            </Field>
            <button type="button" className="text-sm font-medium text-accent-strong hover:underline" onClick={() => { setRecovery(!recovery); setCode(""); }}>
              {t("useRecovery")}
            </button>
          </>
        )}
        <Button type="submit" block size="lg" loading={loading}>
          {mfa ? t("verify") : t("loginTitle")}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
