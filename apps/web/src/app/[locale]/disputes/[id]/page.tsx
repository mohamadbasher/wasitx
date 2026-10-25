"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { use, useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, Field, KeyValue, Skeleton, Textarea, cn, useToast } from "@wasitx/ui";
import type { DisputeDto } from "@wasitx/shared";
import { Container, PageHeader, RequireAuth } from "@/components/app";
import { EvidenceUpload } from "@/components/evidence-upload";
import { Link } from "@/i18n/navigation";
import { fileUrl, get, post } from "@/lib/api";
import { useErrorText, useFmt } from "@/lib/hooks";

export default function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations();
  const f = useFmt();
  const err = useErrorText();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["dispute", id], queryFn: () => get<DisputeDto>(`/disputes/${id}`), refetchInterval: 30_000 });
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<{ id: string; fileName: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const d = q.data;
  return (
    <RequireAuth>
      {() => (
        <Container className="max-w-3xl">
          {!d ? (
            <Skeleton className="h-96" />
          ) : (
            <>
              <PageHeader back={`/trades/${d.tradeId}`} title={`${t("dispute.title")} · ${d.tradeReference}`} action={<Badge tone={d.status === "RESOLVED" ? "success" : d.status === "AWAITING_INFO" ? "warning" : "info"}>{t(`dispute.status_${d.status}`)}</Badge>} />
              {d.status === "AWAITING_INFO" && <Alert tone="warning" className="mb-4">{t("dispute.status_AWAITING_INFO")}</Alert>}
              {d.outcome && (
                <Alert tone="success" className="mb-4" title={t(`dispute.outcome_${d.outcome}`)}>
                  {d.findings && <p className="mt-1">{d.findings}</p>}
                </Alert>
              )}
              <Card className="mb-5 p-5">
                <KeyValue items={[
                  { k: t("dispute.reason"), v: t(`dispute.reason_${d.reason}`) },
                  { k: t("trade.counterparty"), v: t(`dispute.role_${d.openedByRole.toUpperCase()}` as never) },
                  { k: t("dispute.status_OPEN"), v: <span className="num">{f.dateTime(d.createdAt)}</span> },
                ]} />
                <Link href={`/trades/${d.tradeId}`} className="mt-3 inline-block text-sm font-semibold text-accent-strong hover:underline">{t("trade.title", { reference: d.tradeReference })}</Link>
              </Card>
              <Card>
                <CardHeader title={t("dispute.evidence")} />
                <ul className="space-y-4 p-5">
                  {d.messages.map((m) => (
                    <li key={m.id} className={cn("rounded-lg border p-4", m.authorRole === "STAFF" ? "border-info/40 bg-info/5" : "border-border")}>
                      <p className="text-xs font-semibold text-muted">{t.has(`dispute.role_${m.authorRole}` as never) ? t(`dispute.role_${m.authorRole}` as never) : m.authorRole} · <span className="num">{f.dateTime(m.createdAt)}</span></p>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm text-fg">{m.body}</p>
                      {m.evidence.map((e) => (
                        <a key={e.id} href={fileUrl(e.id)} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-1 text-xs text-accent-strong hover:underline"><FileText className="size-3.5" />{e.fileName}</a>
                      ))}
                    </li>
                  ))}
                </ul>
                {d.status !== "RESOLVED" && (
                  <form
                    className="space-y-3 border-t border-border p-5"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setBusy(true);
                      try {
                        await post(`/disputes/${id}/messages`, { body, evidenceFileIds: files.map((x) => x.id) });
                        setBody("");
                        setFiles([]);
                        qc.invalidateQueries({ queryKey: ["dispute", id] });
                      } catch (er) {
                        toast("danger", err(er));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Field label={t("dispute.reply")}><Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} /></Field>
                    <EvidenceUpload files={files} onChange={setFiles} />
                    <Button type="submit" loading={busy} disabled={!body.trim()}>{t("common.send")}</Button>
                  </form>
                )}
              </Card>
            </>
          )}
        </Container>
      )}
    </RequireAuth>
  );
}
