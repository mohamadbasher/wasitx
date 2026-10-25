"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LifeBuoy, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Skeleton, Textarea, cn, useToast } from "@wasitx/ui";
import { Container, PageHeader, RequireAuth } from "@/components/app";
import { get, post } from "@/lib/api";
import { useErrorText, useFmt } from "@/lib/hooks";

type Ticket = { id: string; subject: string; category: string; status: string; updatedAt: string };
type TicketDetail = Ticket & { messages: { id: string; isStaff: boolean; body: string; createdAt: string }[] };
const CATS = ["ACCOUNT", "KYC", "TRADE", "PAYMENT", "SECURITY", "OTHER"] as const;

function SupportInner() {
  const t = useTranslations("support");
  const c = useTranslations("common");
  const how = useTranslations("how");
  const f = useFmt();
  const err = useErrorText();
  const toast = useToast();
  const qc = useQueryClient();
  const params = useSearchParams();
  const [selected, setSelected] = useState<string | null>(params.get("ticket"));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", category: "OTHER", body: "" });
  const [reply, setReply] = useState("");
  const tickets = useQuery({ queryKey: ["tickets"], queryFn: () => get<Ticket[]>("/support/tickets") });
  const detail = useQuery({ queryKey: ["ticket", selected], queryFn: () => get<TicketDetail>(`/support/tickets/${selected}`), enabled: !!selected });

  return (
    <Container>
      <PageHeader title={t("title")} action={<Button onClick={() => setOpen(true)}><Plus className="size-4" />{t("newTicket")}</Button>} />
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <Card className="h-fit overflow-hidden">
          <CardHeader title={t("tickets")} />
          {tickets.isLoading ? <Skeleton className="m-4 h-24" /> : !tickets.data?.length ? (
            <EmptyState icon={<LifeBuoy className="size-5" />} title={t("empty")} />
          ) : (
            <ul className="divide-y divide-border">
              {tickets.data.map((tk) => (
                <li key={tk.id}>
                  <button onClick={() => setSelected(tk.id)} className={cn("w-full px-5 py-3.5 text-start hover:bg-surface-2", selected === tk.id && "bg-surface-2")}>
                    <p className="truncate text-sm font-semibold text-fg">{tk.subject}</p>
                    <p className="mt-1 flex items-center gap-2 text-xs text-muted"><Badge tone={tk.status === "AWAITING_USER" ? "warning" : tk.status === "RESOLVED" ? "success" : "neutral"}>{t(`status_${tk.status}` as never)}</Badge><span className="num">{f.dateTime(tk.updatedAt)}</span></p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {selected && detail.data && (
          <Card>
            <CardHeader title={detail.data.subject} subtitle={t(`cat_${detail.data.category}` as never)} />
            <ul className="space-y-3 p-5">
              {detail.data.messages.map((m) => (
                <li key={m.id} className={cn("max-w-[85%] rounded-lg p-3 text-sm", m.isStaff ? "border border-info/40 bg-info/5" : "ms-auto bg-surface-3")}>
                  <p className="text-xs font-semibold text-muted">{m.isStaff ? t("staff") : c("you")} · <span className="num">{f.dateTime(m.createdAt)}</span></p>
                  <p className="mt-1 whitespace-pre-wrap text-fg">{m.body}</p>
                </li>
              ))}
            </ul>
            {detail.data.status !== "CLOSED" && (
              <form className="flex gap-2 border-t border-border p-4" onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await post(`/support/tickets/${selected}/messages`, { body: reply });
                  setReply("");
                  qc.invalidateQueries({ queryKey: ["ticket", selected] });
                  qc.invalidateQueries({ queryKey: ["tickets"] });
                } catch (er) {
                  toast("danger", err(er));
                }
              }}>
                <Textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} />
                <Button type="submit" disabled={!reply.trim()}>{c("send")}</Button>
              </form>
            )}
          </Card>
        )}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={t("newTicket")} footer={
        <Button disabled={form.subject.length < 3 || form.body.length < 10} onClick={async () => {
          try {
            const tk = await post<Ticket>("/support/tickets", form);
            setOpen(false);
            setForm({ subject: "", category: "OTHER", body: "" });
            setSelected(tk.id);
            qc.invalidateQueries({ queryKey: ["tickets"] });
          } catch (e) {
            toast("danger", err(e));
          }
        }}>{c("submit")}</Button>
      }>
        <div className="space-y-4">
          <Field label={t("subject")}><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} maxLength={120} /></Field>
          <Field label={t("category")}><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATS.map((k) => <option key={k} value={k}>{t(`cat_${k}`)}</option>)}</Select></Field>
          <Field label={t("message")}><Textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} maxLength={4000} /></Field>
          <Alert tone="info">{how("safety1")}</Alert>
        </div>
      </Modal>
    </Container>
  );
}

export default function SupportPage() {
  return (
    <RequireAuth>
      {() => (
        <Suspense>
          <SupportInner />
        </Suspense>
      )}
    </RequireAuth>
  );
}
