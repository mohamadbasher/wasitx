"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Card, Field, Input, Logo } from "@wasitx/ui";
import type { MeDto } from "@wasitx/shared";
import { ApiError, BRAND, API_URL, errorText, get, post, session } from "@/lib/api";

type Step = "password" | "totp" | "enroll" | "codes";

export default function StaffLogin() {
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const login = async (totp?: string) => {
    const r = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-client": "mobile" },
      body: JSON.stringify({ email, password, ...(totp ? { totp } : {}), deviceName: "Staff console" }),
    });
    const j = await r.json();
    if (!r.ok) throw new ApiError(r.status, j.code, j.message);
    session.set({ accessToken: j.accessToken, refreshToken: j.refreshToken });
  };

  const afterLogin = async () => {
    const me = await get<MeDto>("/auth/me");
    if (!me.permissions.includes("admin:access")) {
      session.clear();
      throw new Error("This account has no staff access.");
    }
    if (!me.mfaEnabled) {
      setSetup(await post("/auth/mfa/setup"));
      setStep("enroll");
      return;
    }
    await qc.invalidateQueries();
    router.replace("/");
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.code === "MFA_REQUIRED") setStep("totp");
      else setError(e instanceof Error && !(e instanceof ApiError) ? e.message : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-bg p-4">
      <Card className="w-full max-w-sm p-7">
        <Logo brand={BRAND} />
        <h1 className="mt-6 text-xl font-bold">Staff console</h1>
        <p className="mt-1 text-sm text-muted">Two-step verification is mandatory for staff.</p>
        <div className="mt-6 space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}
          {step === "password" && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void run(async () => { await login(); await afterLogin(); }); }}>
              <Field label="Email"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
              <Button type="submit" block loading={busy}>Continue</Button>
            </form>
          )}
          {step === "totp" && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void run(async () => { await login(code); await afterLogin(); }); }}>
              <Field label="Authenticator code"><Input autoFocus inputMode="numeric" maxLength={6} className="text-center font-mono tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></Field>
              <Button type="submit" block loading={busy} disabled={code.length !== 6}>Verify</Button>
            </form>
          )}
          {step === "enroll" && setup && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void run(async () => { const r = await post<{ recoveryCodes: string[] }>("/auth/mfa/enable", { code }); setCodes(r.recoveryCodes); setStep("codes"); }); }}>
              <Alert tone="warning">Set up two-step verification to continue.</Alert>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qrDataUrl} alt="TOTP QR code" className="mx-auto size-44 rounded-lg bg-white p-2" />
              <p className="break-all text-center font-mono text-xs text-muted">{setup.secret}</p>
              <Field label="6-digit code"><Input inputMode="numeric" maxLength={6} className="text-center font-mono tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></Field>
              <Button type="submit" block loading={busy} disabled={code.length !== 6}>Enable & continue</Button>
            </form>
          )}
          {step === "codes" && (
            <div className="space-y-4">
              <Alert tone="info" title="Save your recovery codes">They won't be shown again.</Alert>
              <ul className="grid grid-cols-2 gap-2 font-mono text-sm">{codes.map((c) => <li key={c} className="rounded bg-surface-2 px-2 py-1.5 text-center">{c}</li>)}</ul>
              <Button block onClick={async () => { await qc.invalidateQueries(); router.replace("/"); }}>I saved them</Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
