import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { kycStartSchema, normalizeIsraeliMobile, type KycStatus } from "@wasitx/shared";
import { Badge, Button, Card, Check, Input, Notice, Screen, T } from "@/components/ui";
import { get, post } from "@/lib/api";
import { useErrorText } from "@/lib/i18n";
import { useMe } from "@/lib/session";

export default function Verify() {
  const t = useTranslations();
  const err = useErrorText();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const kyc = useQuery({ queryKey: ["kyc"], queryFn: () => get<{ status: KycStatus; sandbox: boolean }>("/kyc/status") });
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [k, setK] = useState({ legalFirstName: "", legalLastName: "", nationalId: "", dateOfBirth: "", city: "", street: "", houseNumber: "", postalCode: "", occupation: "", expectedMonthlyVolumeIls: "UP_TO_10K", sourceOfFunds: "SALARY", isPep: false });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["me"] }); qc.invalidateQueries({ queryKey: ["kyc"] }); };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try { await fn(); refresh(); } catch (e) { setError(err(e)); } finally { setBusy(false); }
  };
  if (!me) return null;
  const status = kyc.data?.status;

  return (
    <Screen>
      {error && <Notice tone="danger" text={error} />}
      <Card>
        <T v="h2">{t("onboarding.email")}</T>
        <Badge text={me.emailVerified ? t("common.verified") : t("common.unverified")} tone={me.emailVerified ? "success" : "warning"} />
        {!me.emailVerified && <><T v="muted">{t("auth.verifyEmailBody", { email: me.email })}</T><Button title={t("auth.resend")} variant="outline" onPress={() => run(() => post("/auth/resend-email"))} /></>}
      </Card>
      <Card>
        <T v="h2">{t("onboarding.phone")}</T>
        {me.phoneVerified ? <Badge text={me.phoneMasked ?? t("common.verified")} tone="success" /> : (
          <>
            <Input label={t("auth.phone")} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="05X-XXXXXXX" ltr editable={!sent} error={phone && !normalizeIsraeliMobile(phone) ? t("errors.invalid_il_mobile") : undefined} />
            {sent && <Input label={t("auth.code")} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={6} ltr />}
            <Button title={sent ? t("auth.verify") : t("auth.sendCode")} loading={busy} disabled={!normalizeIsraeliMobile(phone) || (sent && code.length !== 6)} onPress={() => run(async () => {
              if (!sent) { await post("/auth/phone/start", { phone }); setSent(true); } else await post("/auth/phone/verify", { phone, code });
            })} />
          </>
        )}
      </Card>
      <Card>
        <T v="h2">{t("kyc.title")}</T>
        {status && <Badge text={t(`kyc.status_${status}`)} tone={status === "APPROVED" ? "success" : status === "REJECTED" ? "danger" : "warning"} />}
        {(status === "NOT_STARTED" || status === "RESUBMISSION_REQUIRED") && me.emailVerified && me.phoneVerified && (
          <>
            <Input label={t("kyc.firstName")} value={k.legalFirstName} onChangeText={(v) => setK({ ...k, legalFirstName: v })} />
            <Input label={t("kyc.lastName")} value={k.legalLastName} onChangeText={(v) => setK({ ...k, legalLastName: v })} />
            <Input label={t("kyc.nationalId")} value={k.nationalId} onChangeText={(v) => setK({ ...k, nationalId: v.replace(/\D/g, "") })} keyboardType="number-pad" maxLength={9} ltr />
            <Input label={`${t("kyc.dob")} (YYYY-MM-DD)`} value={k.dateOfBirth} onChangeText={(v) => setK({ ...k, dateOfBirth: v })} ltr />
            <Input label={t("kyc.city")} value={k.city} onChangeText={(v) => setK({ ...k, city: v })} />
            <Input label={t("kyc.street")} value={k.street} onChangeText={(v) => setK({ ...k, street: v })} />
            <Input label={t("kyc.houseNumber")} value={k.houseNumber} onChangeText={(v) => setK({ ...k, houseNumber: v })} />
            <Input label={t("kyc.postalCode")} value={k.postalCode} onChangeText={(v) => setK({ ...k, postalCode: v.replace(/\D/g, "") })} keyboardType="number-pad" maxLength={7} ltr />
            <Input label={t("kyc.occupation")} value={k.occupation} onChangeText={(v) => setK({ ...k, occupation: v })} />
            <Check label={t("kyc.pep")} value={k.isPep} onChange={(v) => setK({ ...k, isPep: v })} />
            <T v="small">{t("kyc.privacy")}</T>
            <Button title={t("kyc.submit")} loading={busy} onPress={() => run(async () => {
              const parsed = kycStartSchema.safeParse(k);
              if (!parsed.success) throw new Error("VALIDATION_FAILED");
              await post("/kyc/start", parsed.data);
            })} />
          </>
        )}
        {status === "PENDING" && kyc.data?.sandbox && (
          <>
            <Notice tone="warning" text={t("kyc.sandboxBody")} />
            <Button title={t("kyc.simulateApprove")} loading={busy} onPress={() => run(() => post("/kyc/sandbox/complete", { outcome: "APPROVE" }))} />
            <Button title={t("kyc.simulateReview")} variant="outline" onPress={() => run(() => post("/kyc/sandbox/complete", { outcome: "MANUAL_REVIEW" }))} />
            <Button title={t("kyc.simulateReject")} variant="danger" onPress={() => run(() => post("/kyc/sandbox/complete", { outcome: "REJECT" }))} />
          </>
        )}
        {status === "IN_REVIEW" && <T v="muted">{t("kyc.reviewBody")}</T>}
        {status === "APPROVED" && <T v="muted">{t("kyc.approvedBody")}</T>}
      </Card>
    </Screen>
  );
}
