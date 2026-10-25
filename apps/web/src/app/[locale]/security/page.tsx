"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Laptop, ShieldCheck, ShieldOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, CopyButton, Field, Input, Modal, useToast } from "@wasitx/ui";
import type { MeDto } from "@wasitx/shared";
import { Container, PageHeader, RequireAuth } from "@/components/app";
import { useRouter } from "@/i18n/navigation";
import { del, get, post } from "@/lib/api";
import { useErrorText, useFmt } from "@/lib/hooks";

function MfaCard({ me }: { me: MeDto }) {
  const t = useTranslations();
  const err = useErrorText();
  const qc = useQueryClient();
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [disabling, setDisabling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={t("security.mfa")}
        action={<Badge tone={me.mfaEnabled ? "success" : "warning"}>{me.mfaEnabled ? t("security.mfaOn") : t("security.mfaOff")}</Badge>}
      />
      <div className="space-y-4 p-5">
        {error && <Alert tone="danger">{error}</Alert>}
        {!me.mfaEnabled && !setup && (
          <Button onClick={() => run(async () => setSetup(await post("/auth/mfa/setup")))} loading={busy}>
            <ShieldCheck className="size-4" /> {t("security.mfaEnable")}
          </Button>
        )}
        {setup && (
          <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qrDataUrl} alt="QR" className="size-44 rounded-lg bg-white p-2" />
            <div className="space-y-3">
              <p className="text-sm text-muted">{t("security.mfaScan")}</p>
              <p className="text-xs text-subtle">{t("security.mfaSecret")}</p>
              <p className="flex items-center gap-2 font-mono text-sm text-fg" dir="ltr">{setup.secret}<CopyButton value={setup.secret} label={t("common.copy")} copiedLabel={t("common.copied")} /></p>
              <div className="flex gap-2">
                <Input inputMode="numeric" maxLength={6} dir="ltr" className="max-w-36 text-center font-mono tracking-widest" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" />
                <Button disabled={code.length !== 6} loading={busy} onClick={() => run(async () => {
                  const r = await post<{ recoveryCodes: string[] }>("/auth/mfa/enable", { code });
                  setCodes(r.recoveryCodes);
                  setSetup(null);
                  setCode("");
                  qc.invalidateQueries({ queryKey: ["me"] });
                })}>{t("auth.verify")}</Button>
              </div>
            </div>
          </div>
        )}
        {me.mfaEnabled && !disabling && (
          <Button variant="outline" onClick={() => setDisabling(true)}><ShieldOff className="size-4" />{t("security.mfaDisable")}</Button>
        )}
        {disabling && (
          <div className="flex gap-2">
            <Input inputMode="numeric" maxLength={6} dir="ltr" className="max-w-36 text-center font-mono tracking-widest" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" />
            <Button variant="danger" disabled={code.length !== 6} loading={busy} onClick={() => run(async () => {
              await post("/auth/mfa/disable", { code });
              setDisabling(false);
              setCode("");
              qc.invalidateQueries({ queryKey: ["me"] });
            })}>{t("security.mfaDisable")}</Button>
          </div>
        )}
      </div>
      <Modal open={!!codes} onClose={() => setCodes(null)} title={t("security.recoveryTitle")} footer={<Button onClick={() => setCodes(null)}>{t("common.close")}</Button>}>
        <p className="text-sm text-muted">{t("security.recoveryBody")}</p>
        <ul className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm" dir="ltr">
          {codes?.map((c) => <li key={c} className="rounded-md bg-surface-2 px-3 py-2 text-center">{c}</li>)}
        </ul>
        {codes && <CopyButton className="mt-3" value={codes.join("\n")} label={t("common.copy")} copiedLabel={t("common.copied")} />}
      </Modal>
    </Card>
  );
}

function PasswordCard() {
  const t = useTranslations();
  const err = useErrorText();
  const toast = useToast();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader title={t("security.password")} />
      <form
        className="grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await post("/auth/password/change", { currentPassword: cur, newPassword: next });
            setCur("");
            setNext("");
            toast("success", t("common.saved"));
          } catch (e) {
            toast("danger", err(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={t("security.currentPassword")}><Input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
        <Field label={t("auth.newPassword")}><Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        <Button type="submit" loading={busy} disabled={!cur || next.length < 12}>{t("security.changePassword")}</Button>
      </form>
    </Card>
  );
}

function SessionsCard() {
  const t = useTranslations();
  const f = useFmt();
  const qc = useQueryClient();
  const router = useRouter();
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => get<{ id: string; current: boolean; device: string; ip: string | null; lastUsedAt: string }[]>("/auth/sessions") });
  const history = useQuery({ queryKey: ["login-history"], queryFn: () => get<{ id: string; success: boolean; ip: string | null; userAgent: string | null; newDevice: boolean; createdAt: string }[]>("/auth/login-history") });
  return (
    <>
      <Card>
        <CardHeader
          title={t("security.sessions")}
          action={<Button size="sm" variant="outline" onClick={async () => { await post("/auth/logout-all"); qc.clear(); router.replace("/login"); }}>{t("security.logoutAll")}</Button>}
        />
        <ul className="divide-y divide-border">
          {sessions.data?.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <Laptop className="size-5 shrink-0 text-muted" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{s.device}</p>
                  <p className="num text-xs text-muted">{s.ip} · {f.dateTime(s.lastUsedAt)}</p>
                </div>
              </div>
              {s.current ? <Badge tone="accent">{t("security.current")}</Badge> : (
                <Button size="sm" variant="ghost" onClick={async () => { await del(`/auth/sessions/${s.id}`); qc.invalidateQueries({ queryKey: ["sessions"] }); }}>{t("security.revoke")}</Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title={t("security.history")} />
        <ul className="divide-y divide-border">
          {history.data?.slice(0, 10).map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
              <span className="truncate text-muted">{h.userAgent?.slice(0, 60) ?? "—"}</span>
              <span className="flex shrink-0 items-center gap-2">
                {h.newDevice && <Badge tone="warning">{t("security.newDevice")}</Badge>}
                <Badge tone={h.success ? "success" : "danger"}>{h.success ? t("security.success") : t("security.failed")}</Badge>
                <span className="num text-xs text-subtle">{f.dateTime(h.createdAt)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function CloseAccount() {
  const t = useTranslations();
  const err = useErrorText();
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  return (
    <Card className="border-danger/30">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="font-semibold text-fg">{t("security.deleteAccount")}</p>
          <p className="mt-1 max-w-xl text-sm text-muted">{t("security.deleteBody")}</p>
        </div>
        <Button variant="outline" className="text-danger" onClick={() => setOpen(true)}>{t("security.deleteAccount")}</Button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={t("security.deleteAccount")} footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button variant="danger" onClick={async () => {
            try {
              await post("/me/delete-request");
              qc.clear();
              router.replace("/");
            } catch (e) {
              toast("danger", err(e));
              setOpen(false);
            }
          }}>{t("security.deleteConfirm")}</Button>
        </>
      }>
        <p className="text-sm text-muted">{t("security.deleteBody")}</p>
      </Modal>
    </Card>
  );
}

export default function SecurityPage() {
  const t = useTranslations("security");
  return (
    <RequireAuth>
      {(me) => (
        <Container className="max-w-4xl">
          <PageHeader title={t("title")} />
          <div className="space-y-5">
            <MfaCard me={me} />
            <Card className="flex items-center gap-3 p-5 text-sm text-muted"><KeyRound className="size-5 text-subtle" /><span><b className="text-fg">{t("passkeys")}</b> — {t("passkeysSoon")}</span></Card>
            <PasswordCard />
            <SessionsCard />
            <CloseAccount />
          </div>
        </Container>
      )}
    </RequireAuth>
  );
}
