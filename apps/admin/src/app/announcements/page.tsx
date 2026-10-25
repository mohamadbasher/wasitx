"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, Checkbox, Field, Input, Select, Textarea, useToast } from "@wasitx/ui";
import { errorText, get, post } from "@/lib/api";
import { DataTable, H1, when } from "@/components/shell";

type A = { id: string; title: Record<string, string>; severity: string; publishedAt: string | null; archivedAt: string | null; createdAt: string };
const LANGS = [["ar", "العربية", "rtl"], ["he", "עברית", "rtl"], ["en", "English", "ltr"]] as const;

export default function AnnouncementsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["announcements"], queryFn: () => get<A[]>("/admin/announcements") });
  const empty = { ar: "", he: "", en: "" };
  const [title, setTitle] = useState(empty);
  const [body, setBody] = useState(empty);
  const [severity, setSeverity] = useState("INFO");
  const [publish, setPublish] = useState(true);
  const complete = LANGS.every(([l]) => title[l] && body[l]);
  return (
    <>
      <H1 sub="Announcements must be written in all three languages.">Announcements</H1>
      <Card className="mb-5">
        <CardHeader title="New announcement" />
        <form className="space-y-4 p-5" onSubmit={async (e) => {
          e.preventDefault();
          try { await post("/admin/announcements", { title, body, severity, publish }); setTitle(empty); setBody(empty); qc.invalidateQueries({ queryKey: ["announcements"] }); toast("success", "Saved"); } catch (er) { toast("danger", errorText(er)); }
        }}>
          <div className="grid gap-4 lg:grid-cols-3">
            {LANGS.map(([l, name, dir]) => (
              <div key={l} className="space-y-2" dir={dir}>
                <Field label={`${name} — title`}><Input value={title[l]} onChange={(e) => setTitle({ ...title, [l]: e.target.value })} /></Field>
                <Field label={`${name} — body`}><Textarea value={body[l]} onChange={(e) => setBody({ ...body, [l]: e.target.value })} /></Field>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Select className="w-40" value={severity} onChange={(e) => setSeverity(e.target.value)}>{["INFO", "WARNING", "CRITICAL"].map((s) => <option key={s}>{s}</option>)}</Select>
            <Checkbox label="Publish now" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            <Button type="submit" disabled={!complete}>Save</Button>
          </div>
        </form>
      </Card>
      <Card className="overflow-hidden">
        <DataTable rows={q.data} cols={[
          { h: "Title (en)", c: (a) => a.title.en },
          { h: "Severity", c: (a) => <Badge tone={a.severity === "CRITICAL" ? "danger" : a.severity === "WARNING" ? "warning" : "info"}>{a.severity}</Badge> },
          { h: "Published", c: (a) => when(a.publishedAt) },
          { h: "Archived", c: (a) => when(a.archivedAt) },
          { h: "", c: (a) => !a.archivedAt && <Button size="sm" variant="ghost" onClick={async () => { await post(`/admin/announcements/${a.id}/archive`); qc.invalidateQueries({ queryKey: ["announcements"] }); }}>Archive</Button> },
        ]} />
      </Card>
    </>
  );
}
