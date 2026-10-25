"use client";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert, Button, Field, Input } from "@wasitx/ui";
import { normalizeIsraeliMobile } from "@wasitx/shared";
import { AuthShell } from "@/components/auth-shell";
import { RequireAuth } from "@/components/app";
import { Link } from "@/i18n/navigation";
import { post } from "@/lib/api";
import { useErrorText } from "@/lib/hooks";

export default function VerifyPhonePage() {
  const t = useTranslations();
  const err = useErrorText();
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const valid = !!normalizeIsraeliMobile(phone);

  return (
    <RequireAuth>
      {(me) =>
        me.phoneVerified ? (
          <AuthShell title={t("auth.phoneDone")}>
            <CheckCircle2 className="size-10 text-accent" />
            <p className="mt-3 text-sm text-muted num">{me.phoneMasked}</p>
            <Link href="/kyc" className="mt-6 block">
              <Button block>{t("onboarding.nextStep")}</Button>
            </Link>
          </AuthShell>
        ) : (
          <AuthShell title={t("auth.phoneTitle")} subtitle={t("auth.phoneSubtitle")}>
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                setLoading(true);
                try {
                  if (!sent) {
                    await post("/auth/phone/start", { phone });
                    setSent(true);
                  } else {
                    await post("/auth/phone/verify", { phone, code });
                    await qc.invalidateQueries({ queryKey: ["me"] });
                  }
                } catch (e) {
                  setError(err(e));
                } finally {
                  setLoading(false);
                }
              }}
            >
              {error && <Alert tone="danger">{error}</Alert>}
              <Field label={t("auth.phone")} htmlFor="phone" error={phone && !valid ? t("errors.invalid_il_mobile") : undefined}>
                <div className="flex" dir="ltr">
                  <span className="grid place-items-center rounded-s-md border border-e-0 border-border-strong bg-surface-3 px-3 text-sm text-muted">🇮🇱 +972</span>
                  <Input id="phone" type="tel" inputMode="tel" autoComplete="tel-national" className="rounded-s-none" placeholder="05X-XXXXXXX" value={phone} disabled={sent} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </Field>
              {sent && (
                <Field label={t("auth.code")} htmlFor="otp">
                  <Input id="otp" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" className="text-center font-mono text-lg tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                </Field>
              )}
              <Button type="submit" block size="lg" loading={loading} disabled={!valid || (sent && code.length !== 6)}>
                {sent ? t("auth.verify") : t("auth.sendCode")}
              </Button>
              {sent && (
                <button type="button" className="w-full text-sm font-medium text-accent-strong hover:underline" onClick={() => { setSent(false); setCode(""); }}>
                  {t("common.back")}
                </button>
              )}
            </form>
          </AuthShell>
        )
      }
    </RequireAuth>
  );
}
