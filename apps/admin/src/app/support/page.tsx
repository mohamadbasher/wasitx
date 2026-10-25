"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, Checkbox, Select, Tabs, Textarea, cn, useToast } from "@wasitx/ui";
import { errorText, get, post } from "@/lib/api";
import { H1, tone, when } from "@/components/shell";

type T = { id: string; subject: string; category: string; status: string; user: { displayName: string; email: string }; updatedAt: string };
type D = { id: string; subject: string; status: string; tradeId: string | null; user?: { displayName: string; email: string }; messages: { id: string; isStaff: boolean; internal: boolean; body: string; createdAt: string }[] };

export default function SupportInbox() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const inbox = useQuery({ queryKey: ["inbox", status], queryFn: () => get<T[]>(`/admin/support/inbox${status ? `?status=${status}` : ""}`), refetchInterval: 20_000 });
  const d = useQuery({ queryKey: ["ticket", sel], queryFn: () => get<D>(`/admin/support/tickets/${sel}`), enabled: !!sel });
  return (
    <>
      <H1>Support inbox</H1>
      <Tabs className="mb-4" size="sm" value={status} onChange={setStatus} items={[{ value: "", label: "Needs support" }, ...["AWAITING_USER", "RESOLVED", "CLOSED"].map((s) => ({ value: s, label: s }))]} />
      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {inbox.data?.map((t) => (
              <li key={t.id}>
                <button onClick={() => setSel(t.id)} className={cn("w-full px-4 py-3 text-start hover:bg-surface-2", sel === t.id && "bg-surface-2")}>
                  <p className="truncate text-sm font-semibold">{t.subject}</p>
                  <p className="text-xs text-muted">{t.user.displayName} · {t.category} · {when(t.updatedAt)}</p>
                  <Badge tone={tone(t.status)} className="mt-1">{t.status}</Badge>
                </button>
              </li>
            ))}
            {inbox.data?.length === 0 && <li className="p-8 text-center text-sm text-muted">Inbox zero</li>}
          </ul>
        </Card>
        {d.data && (
          <Card>
            <CardHeader title={d.data.subject} subtitle={`${d.data.user?.displayName} <${d.data.user?.email}>`} action={
              <Select className="h-9 w-44" value={d.data.status} onChange={async (e) => { await post(`/admin/support/tickets/${sel}/status`, { status: e.target.value }); qc.invalidateQueries({ queryKey: ["ticket", sel] }); qc.invalidateQueries({ queryKey: ["inbox"] }); }}>
                {["OPEN", "AWAITING_SUPPORT", "AWAITING_USER", "RESOLVED", "CLOSED"].map((s) => <option key={s}>{s}</option>)}
              </Select>
            } />
            <ul className="space-y-3 p-5">
              {d.data.messages.map((m) => (
                <li key={m.id} className={cn("max-w-[85%] rounded-lg p-3 text-sm", m.internal ? "border border-warning/40 bg-warning/5" : m.isStaff ? "ms-auto bg-accent/10" : "bg-surface-3")}>
                  <p className="text-xs font-semibold text-muted">{m.internal ? "Internal note" : m.isStaff ? "Support" : "Customer"} · {when(m.createdAt)}</p>
                  <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                </li>
              ))}
            </ul>
            <form className="space-y-2 border-t border-border p-4" onSubmit={async (e) => {
              e.preventDefault();
              try { await post(`/admin/support/tickets/${sel}/messages`, { body, internal }); setBody(""); qc.invalidateQueries({ queryKey: ["ticket", sel] }); qc.invalidateQueries({ queryKey: ["inbox"] }); } catch (er) { toast("danger", errorText(er)); }
            }}>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Reply to customer" />
              <div className="flex items-center justify-between"><Checkbox label="Internal note" checked={internal} onChange={(e) => setInternal(e.target.checked)} /><Button type="submit" disabled={!body.trim()}>Send</Button></div>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
