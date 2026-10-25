"use client";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Alert, Button, Spinner } from "@wasitx/ui";
import { AuthShell } from "@/components/auth-shell";
import { Link } from "@/i18n/navigation";
import { post } from "@/lib/api";
import { useErrorText, useMe } from "@/lib/hooks";

function VerifyEmailInner() {
  const t = useTranslations("auth");
  const o = useTranslations("onboarding");
  const err = useErrorText();
  const qc = useQueryClient();
  const params = useSearchParams();
  const token = params.get("token");
  const { data: me } = useMe();
  const [state, setState] = useState<"idle" | "verifying" | "done" | "failed">(token ? "verifying" : "idle");
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    post("/auth/verify-email", { token })
      .then(() => {
        setState("done");
        qc.invalidateQueries({ queryKey: ["me"] });
      })
      .catch(() => setState("failed"));
  }, [token, qc]);

  if (state === "verifying") return <AuthShell title={t("verifyEmailTitle")}><Spinner /></AuthShell>;
  if (state === "done" || me?.emailVerified) {
    return (
      <AuthShell title={t("verifyEmailDone")}>
        <CheckCircle2 className="size-10 text-accent" />
        <Link href={me ? "/verify-phone" : "/login"} className="mt-6 block">
          <Button block>{o("nextStep")}</Button>
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={t("verifyEmailTitle")} subtitle={me ? t("verifyEmailBody", { email: me.email }) : undefined}>
      {state === "failed" && <Alert tone="danger" className="mb-4">{t("verifyEmailFailed")}</Alert>}
      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
      <MailCheck className="size-10 text-accent" />
      {me && (
        <Button
          variant="outline"
          block
          className="mt-6"
          disabled={resent}
          onClick={async () => {
            try {
              await post("/auth/resend-email");
              setResent(true);
            } catch (e) {
              setError(err(e));
            }
          }}
        >
          {resent ? t("resent") : t("resend")}
        </Button>
      )}
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailInner />
    </Suspense>
  );
}
