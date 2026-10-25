"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Skeleton, useToast } from "@wasitx/ui";
import { ISRAELI_BANKS, bankAccountSchema } from "@wasitx/shared";
import { Container, PageHeader, RequireAuth } from "@/components/app";
import { Link } from "@/i18n/navigation";
import { del, get, post } from "@/lib/api";
import { useErrorText } from "@/lib/hooks";

interface Bank {
  id: string;
  bankCode: string;
  bankName: Record<string, string>;
  branchNumber: string;
  accountMasked: string;
  holderName: string;
  status: "PENDING" | "VERIFIED" | "REJECTED" | "DISABLED";
}

export default function BankAccountsPage() {
  const t = useTranslations();
  const locale = useLocale() as "ar" | "he" | "en";
  const err = useErrorText();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["banks"], queryFn: () => get<Bank[]>("/bank-accounts") });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ bankCode: "12", branchNumber: "", accountNumber: "", holderName: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const add = async () => {
    const parsed = bankAccountSchema.safeParse(form);
    if (!parsed.success) return setError(t("errors.VALIDATION_FAILED"));
    setSaving(true);
    setError(null);
    try {
      await post("/bank-accounts", parsed.data);
      setOpen(false);
      setForm({ bankCode: "12", branchNumber: "", accountNumber: "", holderName: "" });
      qc.invalidateQueries({ queryKey: ["banks"] });
    } catch (e) {
      setError(err(e));
      qc.invalidateQueries({ queryKey: ["banks"] });
    } finally {
      setSaving(false);
    }
  };

  return (
    <RequireAuth>
      {(me) => (
        <Container className="max-w-3xl">
          <PageHeader title={t("bank.title")} subtitle={t("bank.subtitle")} action={me.kycStatus === "APPROVED" && <Button onClick={() => setOpen(true)}><Plus className="size-4" />{t("bank.add")}</Button>} />
          {me.kycStatus !== "APPROVED" && (
            <Alert tone="warning" className="mb-4" title={t("bank.kycFirst")}>
              <Link href="/kyc" className="font-semibold text-accent-strong hover:underline">{t("nav.kyc")}</Link>
            </Alert>
          )}
          <Card>
            {q.isLoading ? (
              <Skeleton className="m-4 h-24" />
            ) : !q.data?.length ? (
              <EmptyState icon={<Landmark className="size-5" />} title={t("bank.empty")} />
            ) : (
              <ul className="divide-y divide-border">
                {q.data.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-4 p-5">
                    <div className="flex items-center gap-3">
                      <div className="grid size-10 place-items-center rounded-lg bg-surface-3"><Landmark className="size-5 text-muted" /></div>
                      <div>
                        <p className="font-semibold text-fg">{b.bankName[locale] ?? b.bankName.en}</p>
                        <p className="num text-sm text-muted">{b.branchNumber} · {b.accountMasked} · {b.holderName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={b.status === "VERIFIED" ? "success" : b.status === "REJECTED" ? "danger" : "warning"}>{t(`bank.status_${b.status}`)}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t("common.remove")}
                        onClick={async () => {
                          try {
                            await del(`/bank-accounts/${b.id}`);
                            qc.invalidateQueries({ queryKey: ["banks"] });
                          } catch (e) {
                            toast("danger", err(e));
                          }
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Modal
            open={open}
            onClose={() => setOpen(false)}
            title={t("bank.add")}
            footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button><Button onClick={add} loading={saving}>{t("common.save")}</Button></>}
          >
            <div className="space-y-4">
              {error && <Alert tone="danger">{error}</Alert>}
              <Field label={t("bank.bank")}>
                <Select value={form.bankCode} onChange={(e) => setForm({ ...form, bankCode: e.target.value })}>
                  {ISRAELI_BANKS.map((b) => <option key={b.code} value={b.code}>{b.code} — {b.name[locale]}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-[1fr_2fr] gap-3">
                <Field label={t("bank.branch")}><Input inputMode="numeric" maxLength={3} dir="ltr" value={form.branchNumber} onChange={(e) => setForm({ ...form, branchNumber: e.target.value.replace(/\D/g, "") })} /></Field>
                <Field label={t("bank.account")}><Input inputMode="numeric" maxLength={13} dir="ltr" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value.replace(/\D/g, "") })} /></Field>
              </div>
              <Field label={t("bank.holder")} hint={t("bank.holderHint")}><Input value={form.holderName} onChange={(e) => setForm({ ...form, holderName: e.target.value })} /></Field>
            </div>
          </Modal>
        </Container>
      )}
    </RequireAuth>
  );
}
