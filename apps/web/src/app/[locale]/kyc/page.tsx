"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, FlaskConical, ShieldCheck, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Select, Skeleton } from "@wasitx/ui";
import { kycStartSchema, type KycStatus } from "@wasitx/shared";
import { Container, PageHeader, RequireAuth } from "@/components/app";
import { Link } from "@/i18n/navigation";
import { post, get } from "@/lib/api";
import { useErrorText } from "@/lib/hooks";

interface KycStatusDto {
  status: KycStatus;
  legalName: string | null;
  reviewNote: string | null;
  sandbox: boolean;
}

const VOLUMES = ["UP_TO_10K", "10K_50K", "50K_200K", "OVER_200K"] as const;
const SOF = ["SALARY", "BUSINESS", "SAVINGS", "INVESTMENTS", "INHERITANCE", "OTHER"] as const;

function KycForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations();
  const err = useErrorText();
  const [f, setF] = useState({ legalFirstName: "", legalLastName: "", nationalId: "", dateOfBirth: "", city: "", street: "", houseNumber: "", postalCode: "", occupation: "", expectedMonthlyVolumeIls: "UP_TO_10K", sourceOfFunds: "SALARY", isPep: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const fe = (k: string) => (errors[k] ? (t.has(`errors.${errors[k]}` as never) ? t(`errors.${errors[k]}` as never) : t("common.required")) : undefined);

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const parsed = kycStartSchema.safeParse(f);
        if (!parsed.success) {
          setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
          return;
        }
        setErrors({});
        setError(null);
        setLoading(true);
        try {
          await post("/kyc/start", parsed.data);
          onDone();
        } catch (e) {
          setError(err(e));
        } finally {
          setLoading(false);
        }
      }}
    >
      {error && <Alert tone="danger">{error}</Alert>}
      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-semibold text-fg">{t("kyc.personal")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("kyc.firstName")} error={fe("legalFirstName")}><Input value={f.legalFirstName} onChange={set("legalFirstName")} autoComplete="given-name" /></Field>
          <Field label={t("kyc.lastName")} error={fe("legalLastName")}><Input value={f.legalLastName} onChange={set("legalLastName")} autoComplete="family-name" /></Field>
          <Field label={t("kyc.nationalId")} error={fe("nationalId")}><Input value={f.nationalId} onChange={set("nationalId")} inputMode="numeric" maxLength={9} dir="ltr" /></Field>
          <Field label={t("kyc.dob")} error={fe("dateOfBirth")}><Input type="date" value={f.dateOfBirth} onChange={set("dateOfBirth")} dir="ltr" /></Field>
        </div>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-semibold text-fg">{t("kyc.address")}</legend>
        <div className="grid gap-4 sm:grid-cols-[2fr_2fr_1fr_1.4fr]">
          <Field label={t("kyc.city")} error={fe("city")}><Input value={f.city} onChange={set("city")} autoComplete="address-level2" /></Field>
          <Field label={t("kyc.street")} error={fe("street")}><Input value={f.street} onChange={set("street")} autoComplete="address-line1" /></Field>
          <Field label={t("kyc.houseNumber")} error={fe("houseNumber")}><Input value={f.houseNumber} onChange={set("houseNumber")} /></Field>
          <Field label={t("kyc.postalCode")} error={fe("postalCode")}><Input value={f.postalCode} onChange={set("postalCode")} inputMode="numeric" maxLength={7} dir="ltr" autoComplete="postal-code" /></Field>
        </div>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-semibold text-fg">{t("kyc.profile")}</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("kyc.occupation")} error={fe("occupation")}><Input value={f.occupation} onChange={set("occupation")} /></Field>
          <Field label={t("kyc.volume")}>
            <Select value={f.expectedMonthlyVolumeIls} onChange={set("expectedMonthlyVolumeIls")}>
              {VOLUMES.map((v) => <option key={v} value={v}>{t(`kyc.volume_${v}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("kyc.sourceOfFunds")}>
            <Select value={f.sourceOfFunds} onChange={set("sourceOfFunds")}>
              {SOF.map((v) => <option key={v} value={v}>{t(`kyc.sof_${v}`)}</option>)}
            </Select>
          </Field>
        </div>
        <Checkbox label={t("kyc.pep")} checked={f.isPep} onChange={(e) => setF({ ...f, isPep: e.target.checked })} />
      </fieldset>
      <p className="flex items-start gap-2 text-xs text-muted"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" />{t("kyc.privacy")}</p>
      <Button type="submit" size="lg" loading={loading}>{t("kyc.submit")}</Button>
    </form>
  );
}

function SandboxVerdict({ onDone }: { onDone: () => void }) {
  const t = useTranslations("kyc");
  const err = useErrorText();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (outcome: string) => {
    setBusy(outcome);
    try {
      await post("/kyc/sandbox/complete", { outcome });
      onDone();
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-4">
      <Alert tone="info" title={t("documentStep")}>{t("documentBody")}</Alert>
      <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
        <p className="flex items-center gap-2 font-semibold text-warning"><FlaskConical className="size-4" />{t("sandboxTitle")}</p>
        <p className="mt-1 text-sm text-muted">{t("sandboxBody")}</p>
        {error && <Alert tone="danger" className="mt-3">{error}</Alert>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" loading={busy === "APPROVE"} onClick={() => run("APPROVE")}>{t("simulateApprove")}</Button>
          <Button size="sm" variant="outline" loading={busy === "MANUAL_REVIEW"} onClick={() => run("MANUAL_REVIEW")}>{t("simulateReview")}</Button>
          <Button size="sm" variant="outline" loading={busy === "RESUBMIT"} onClick={() => run("RESUBMIT")}>{t("simulateResubmit")}</Button>
          <Button size="sm" variant="danger" loading={busy === "REJECT"} onClick={() => run("REJECT")}>{t("simulateReject")}</Button>
        </div>
      </div>
    </div>
  );
}

export default function KycPage() {
  const t = useTranslations();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["kyc"], queryFn: () => get<KycStatusDto>("/kyc/status") });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["kyc"] });
    qc.invalidateQueries({ queryKey: ["me"] });
  };
  return (
    <RequireAuth>
      {(me) => (
        <Container className="max-w-3xl">
          <PageHeader title={t("kyc.title")} subtitle={t("kyc.subtitle")} action={q.data && <Badge tone={q.data.status === "APPROVED" ? "success" : q.data.status === "REJECTED" ? "danger" : "warning"}>{t(`kyc.status_${q.data.status}`)}</Badge>} />
          <Card className="p-6">
            {!q.data ? (
              <Skeleton className="h-64" />
            ) : !me.emailVerified || !me.phoneVerified ? (
              <Alert tone="warning" title={t("kyc.prerequisites")}>
                <Link href={me.emailVerified ? "/verify-phone" : "/verify-email"} className="font-semibold text-accent-strong hover:underline">{t("onboarding.nextStep")}</Link>
              </Alert>
            ) : q.data.status === "APPROVED" ? (
              <div className="flex items-start gap-4">
                <CheckCircle2 className="size-10 shrink-0 text-accent" />
                <div>
                  <p className="font-semibold text-fg">{q.data.legalName}</p>
                  <p className="mt-1 text-muted">{t("kyc.approvedBody")}</p>
                  <Link href="/bank-accounts" className="mt-4 inline-block"><Button>{t("onboarding.bank")}</Button></Link>
                </div>
              </div>
            ) : q.data.status === "PENDING" ? (
              q.data.sandbox ? <SandboxVerdict onDone={refresh} /> : <Alert tone="info" title={t("kyc.documentStep")}>{t("kyc.documentBody")}</Alert>
            ) : q.data.status === "IN_REVIEW" ? (
              <div className="flex items-start gap-4"><Clock className="size-10 shrink-0 text-warning" /><p className="text-muted">{t("kyc.reviewBody")}</p></div>
            ) : q.data.status === "REJECTED" || q.data.status === "REVOKED" ? (
              <div className="flex items-start gap-4"><XCircle className="size-10 shrink-0 text-danger" /><div><p className="text-muted">{t("kyc.rejectedBody")}</p><Link href="/support" className="mt-3 inline-block"><Button variant="outline">{t("nav.support")}</Button></Link></div></div>
            ) : (
              <>
                {q.data.status === "RESUBMISSION_REQUIRED" && <Alert tone="warning" className="mb-6" title={t("kyc.status_RESUBMISSION_REQUIRED")}>{q.data.reviewNote}</Alert>}
                <KycForm onDone={refresh} />
              </>
            )}
          </Card>
        </Container>
      )}
    </RequireAuth>
  );
}
