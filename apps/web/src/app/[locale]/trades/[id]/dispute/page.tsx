"use client";
import { useTranslations } from "next-intl";
import { use, useState } from "react";
import { Alert, Button, Card, Field, Select, Textarea } from "@wasitx/ui";
import { DISPUTE_REASONS, type DisputeDto } from "@wasitx/shared";
import { Container, PageHeader, RequireAuth } from "@/components/app";
import { EvidenceUpload } from "@/components/evidence-upload";
import { useRouter } from "@/i18n/navigation";
import { post } from "@/lib/api";
import { useErrorText } from "@/lib/hooks";

export default function OpenDisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("dispute");
  const err = useErrorText();
  const router = useRouter();
  const [reason, setReason] = useState<string>(DISPUTE_REASONS[0]);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<{ id: string; fileName: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <RequireAuth>
      {() => (
        <Container className="max-w-2xl">
          <PageHeader back={`/trades/${id}`} title={t("openTitle")} subtitle={t("openSubtitle")} />
          <Card className="p-6">
            <form
              className="space-y-5"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError(null);
                try {
                  const d = await post<DisputeDto>(`/trades/${id}/dispute`, { reason, description, evidenceFileIds: files.map((f) => f.id) });
                  router.replace(`/disputes/${d.id}`);
                } catch (e) {
                  setError(err(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {error && <Alert tone="danger">{error}</Alert>}
              <Field label={t("reason")}>
                <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                  {DISPUTE_REASONS.map((r) => <option key={r} value={r}>{t(`reason_${r}`)}</option>)}
                </Select>
              </Field>
              <Field label={t("description")} hint={t("descriptionHint")}>
                <Textarea rows={6} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
              </Field>
              <Field label={t("evidence")}>
                <EvidenceUpload files={files} onChange={setFiles} />
              </Field>
              <Button type="submit" variant="danger" size="lg" loading={busy} disabled={description.trim().length < 20}>{t("submit")}</Button>
            </form>
          </Card>
        </Container>
      )}
    </RequireAuth>
  );
}
