"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, FileText, Flag, Gavel, Loader2, Lock, Paperclip, Send, ShieldAlert, ThumbsDown, ThumbsUp, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { use, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, Checkbox, CopyButton, ErrorState, Field, KeyValue, Modal, Skeleton, Textarea, cn, useToast } from "@wasitx/ui";
import type { MessageDto, TradeDto } from "@wasitx/shared";
import { Container, Countdown, Num, RequireAuth, TradeStatusBadge, TraderCell } from "@/components/app";
import { Link } from "@/i18n/navigation";
import { fileUrl, get, newIdempotencyKey, post, upload } from "@/lib/api";
import { BRAND } from "@/lib/api";
import { useErrorText, useFmt, useTradeRoom } from "@/lib/hooks";

function useTrade(id: string) {
  return useQuery({ queryKey: ["trade", id], queryFn: () => get<TradeDto>(`/trades/${id}`), refetchInterval: (q) => (q.state.data && ["ESCROW_PENDING", "RELEASE_PENDING"].includes(q.state.data.status) ? 2000 : 30_000) });
}

// ── action panel ─────────────────────────────────────────────────────────────
function PaymentInstructions({ trade }: { trade: TradeDto }) {
  const t = useTranslations();
  const f = useFmt();
  const p = trade.paymentInstructions!;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg font-semibold text-fg">{t("trade.payNow", { amount: f.ils(p.amountIls) })}</p>
        {trade.paymentDeadline && (
          <div className="text-end">
            <p className="text-xs text-muted">{t("trade.timeLeft")}</p>
            <Countdown deadline={trade.paymentDeadline} />
          </div>
        )}
      </div>
      <div className="rounded-lg border border-accent/30 bg-accent/5 p-4">
        <KeyValue
          items={[
            { k: t("trade.bank"), v: `${p.bankCode} · ${p.bankName}` },
            { k: t("trade.branch"), v: <Num>{p.branchNumber}</Num> },
            { k: t("trade.accountNo"), v: <span className="inline-flex items-center gap-1"><Num className="font-mono">{p.accountNumber}</Num><CopyButton value={p.accountNumber} label={t("common.copy")} copiedLabel={t("common.copied")} /></span> },
            { k: t("trade.holder"), v: p.holderName, strong: true },
            { k: t("trade.total"), v: <span className="inline-flex items-center gap-1"><Num className="text-base">{f.ils(p.amountIls)}</Num><CopyButton value={p.amountIls} label={t("common.copy")} copiedLabel={t("common.copied")} /></span>, strong: true },
            { k: t("trade.reference"), v: <span className="inline-flex items-center gap-1"><Num className="font-mono font-bold text-accent-strong">{p.reference}</Num><CopyButton value={p.reference} label={t("common.copy")} copiedLabel={t("common.copied")} /></span> },
          ]}
        />
        <p className="mt-2 text-xs text-muted">{t("trade.referenceHint")}</p>
      </div>
      <Alert tone="warning">{t("trade.payRules")}</Alert>
    </div>
  );
}

function MarkPaidModal({ trade, open, onClose }: { trade: TradeDto; open: boolean; onClose: () => void }) {
  const t = useTranslations();
  const f = useFmt();
  const err = useErrorText();
  const toast = useToast();
  const qc = useQueryClient();
  const [own, setOwn] = useState(false);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<{ id: string; fileName: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [key] = useState(newIdempotencyKey);
  return (
    <Modal open={open} onClose={onClose} title={t("trade.markPaid")} footer={
      <>
        <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button disabled={!own} loading={busy} onClick={async () => {
          setBusy(true);
          try {
            await post(`/trades/${trade.id}/mark-paid`, { paidFromOwnAccount: true, note: note || undefined, evidenceFileIds: files.map((x) => x.id) }, key);
            qc.invalidateQueries({ queryKey: ["trade", trade.id] });
            onClose();
          } catch (e) {
            toast("danger", err(e));
          } finally {
            setBusy(false);
          }
        }}>{t("common.confirm")}</Button>
      </>
    }>
      <div className="space-y-4">
        <p className="text-sm text-fg">{t("trade.markPaidConfirm", { amount: f.ils(trade.fiatAmountIls) })}</p>
        <Checkbox label={t("trade.paidFromOwn")} checked={own} onChange={(e) => setOwn(e.target.checked)} />
        <Field label={t("trade.evidence")} hint={t("trade.evidenceHint")}>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="block w-full text-sm text-muted file:me-3 file:rounded-md file:border-0 file:bg-surface-3 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-fg"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const r = await upload(file, "PAYMENT_EVIDENCE");
                setFiles((x) => [...x, r]);
              } catch (er) {
                toast("danger", err(er));
              }
              e.target.value = "";
            }} />
          {files.map((x) => <p key={x.id} className="mt-1 flex items-center gap-1 text-xs text-muted"><FileText className="size-3.5" />{x.fileName}</p>)}
        </Field>
        <Field label={t("common.optional")}><Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></Field>
      </div>
    </Modal>
  );
}

function ConfirmReceiptModal({ trade, open, onClose }: { trade: TradeDto; open: boolean; onClose: () => void }) {
  const t = useTranslations();
  const err = useErrorText();
  const toast = useToast();
  const qc = useQueryClient();
  const [a, setA] = useState(false);
  const [b, setB] = useState(false);
  const [busy, setBusy] = useState(false);
  const [key] = useState(newIdempotencyKey);
  return (
    <Modal open={open} onClose={onClose} title={t("trade.confirmReceipt")} footer={
      <>
        <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button disabled={!a || !b} loading={busy} onClick={async () => {
          setBusy(true);
          try {
            await post(`/trades/${trade.id}/confirm-receipt`, { receivedFullAmount: true, senderNameMatches: true }, key);
            qc.invalidateQueries({ queryKey: ["trade", trade.id] });
            onClose();
          } catch (e) {
            toast("danger", err(e));
          } finally {
            setBusy(false);
          }
        }}>{t("common.confirm")}</Button>
      </>
    }>
      <div className="space-y-4">
        <Alert tone="warning">{t("trade.sellerCheckRules")}</Alert>
        <Checkbox label={t("trade.receivedFull")} checked={a} onChange={(e) => setA(e.target.checked)} />
        <Checkbox label={t("trade.senderMatches")} checked={b} onChange={(e) => setB(e.target.checked)} />
      </div>
    </Modal>
  );
}

function CancelModal({ trade, open, onClose }: { trade: TradeDto; open: boolean; onClose: () => void }) {
  const t = useTranslations();
  const err = useErrorText();
  const toast = useToast();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title={t("trade.cancel")} footer={
      <>
        <Button variant="ghost" onClick={onClose}>{t("common.back")}</Button>
        <Button variant="danger" disabled={reason.trim().length < 3} loading={busy} onClick={async () => {
          setBusy(true);
          try {
            await post(`/trades/${trade.id}/cancel`, { reason }, true);
            qc.invalidateQueries({ queryKey: ["trade", trade.id] });
            onClose();
          } catch (e) {
            toast("danger", err(e));
          } finally {
            setBusy(false);
          }
        }}>{t("trade.cancel")}</Button>
      </>
    }>
      <div className="space-y-4">
        <Alert tone="danger">{t("trade.cancelWarn")}</Alert>
        <Field label={t("trade.cancelReason")}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></Field>
      </div>
    </Modal>
  );
}

function Rating({ trade }: { trade: TradeDto }) {
  const t = useTranslations("trade");
  const qc = useQueryClient();
  if (trade.myRating !== null) return <p className="text-sm text-muted">{t("rated")}</p>;
  const rate = async (positive: boolean) => {
    await post(`/trades/${trade.id}/rate`, { positive });
    qc.invalidateQueries({ queryKey: ["trade", trade.id] });
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted">{t("rate")}</span>
      <Button size="sm" variant="outline" onClick={() => rate(true)}><ThumbsUp className="size-4" />{t("ratePositive")}</Button>
      <Button size="sm" variant="outline" onClick={() => rate(false)}><ThumbsDown className="size-4" />{t("rateNegative")}</Button>
    </div>
  );
}

function ActionPanel({ trade }: { trade: TradeDto }) {
  const t = useTranslations();
  const f = useFmt();
  const [modal, setModal] = useState<null | "paid" | "confirm" | "cancel">(null);
  const isBuyer = trade.myRole === "buyer";
  const s = trade.status;
  const can = (a: string) => trade.availableActions.includes(a as never);

  let body: React.ReactNode;
  if (s === "COMPLIANCE_REVIEW") body = <StatusLine icon={<ShieldAlert className="size-6 text-warning" />} text={t("trade.complianceHold")} />;
  else if (s === "OFFER_ACCEPTED" || s === "ESCROW_PENDING" || s === "ESCROW_CONFIRMED") body = <StatusLine icon={<Loader2 className="size-6 animate-spin text-accent" />} text={t("trade.escrowLocking")} />;
  else if (s === "AWAITING_FIAT_PAYMENT") {
    body = isBuyer ? (
      <div className="space-y-4">
        {trade.paymentInstructions && <PaymentInstructions trade={trade} />}
        <div className="flex flex-wrap gap-2">
          {can("mark_paid") && <Button size="lg" onClick={() => setModal("paid")}><CheckCircle2 className="size-4" />{t("trade.markPaid")}</Button>}
          {can("cancel") && <Button size="lg" variant="ghost" className="text-danger" onClick={() => setModal("cancel")}>{t("trade.cancel")}</Button>}
        </div>
      </div>
    ) : (
      <div className="space-y-4">
        <StatusLine icon={<Clock className="size-6 text-warning" />} text={t("status.AWAITING_FIAT_PAYMENT")} extra={trade.paymentDeadline && <Countdown deadline={trade.paymentDeadline} />} />
        {trade.paymentInstructions && <p className="text-sm text-muted"><Lock className="me-1 inline size-3.5" />{t("trade.lock")}: <Num className="text-fg">{f.usdt(trade.sellerLocksUsdt)} USDT</Num></p>}
      </div>
    );
  } else if (s === "BUYER_MARKED_PAID") {
    body = isBuyer ? (
      <div className="space-y-3">
        <StatusLine icon={<Clock className="size-6 text-info" />} text={t("trade.waitingSeller")} />
        {trade.canOpenDispute ? (
          <Link href={`/trades/${trade.id}/dispute`}><Button variant="outline"><Gavel className="size-4" />{t("trade.openDispute")}</Button></Link>
        ) : (
          <p className="text-xs text-muted">{t("trade.disputeWait", { minutes: t("common.minutes", { count: 15 }) })}</p>
        )}
      </div>
    ) : (
      <div className="space-y-4">
        <Alert tone="warning" title={t("trade.sellerCheck", { amount: f.ils(trade.fiatAmountIls) })}>{t("trade.sellerCheckRules")}</Alert>
        <div className="flex flex-wrap gap-2">
          {can("confirm_receipt") && <Button size="lg" onClick={() => setModal("confirm")}><CheckCircle2 className="size-4" />{t("trade.confirmReceipt")}</Button>}
          {trade.canOpenDispute && <Link href={`/trades/${trade.id}/dispute`}><Button size="lg" variant="outline"><Gavel className="size-4" />{t("trade.openDispute")}</Button></Link>}
        </div>
      </div>
    );
  } else if (s === "SELLER_CONFIRMED_RECEIPT") body = <StatusLine icon={<ShieldAlert className="size-6 text-warning" />} text={t("trade.reviewHold")} />;
  else if (s === "RELEASE_PENDING") body = <StatusLine icon={<Loader2 className="size-6 animate-spin text-accent" />} text={t("status.RELEASE_PENDING")} />;
  else if (s === "COMPLETED")
    body = (
      <div className="space-y-4">
        <StatusLine icon={<CheckCircle2 className="size-7 text-success" />} text={t("trade.completed")} sub={t("trade.completedBody", { amount: f.usdt(trade.buyerReceivesUsdt) })} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Rating trade={trade} />
          <Link href={`/trades/${trade.id}/receipt`}><Button variant="outline" size="sm"><FileText className="size-4" />{t("trade.receipt")}</Button></Link>
        </div>
      </div>
    );
  else if (s === "CANCELLED" || s === "EXPIRED") body = <StatusLine icon={<XCircle className="size-6 text-muted" />} text={s === "EXPIRED" ? t("trade.expired") : t("trade.cancelled")} />;
  else if (s === "DISPUTED") body = <div className="space-y-3"><StatusLine icon={<Gavel className="size-6 text-danger" />} text={t("trade.disputed")} />{trade.disputeId && <Link href={`/disputes/${trade.disputeId}`}><Button variant="outline">{t("trade.viewDispute")}</Button></Link>}</div>;
  else if (s === "FROZEN") body = <StatusLine icon={<AlertTriangle className="size-6 text-danger" />} text={t("trade.frozen")} />;

  return (
    <Card className="p-5 sm:p-6">
      {body}
      <MarkPaidModal trade={trade} open={modal === "paid"} onClose={() => setModal(null)} />
      <ConfirmReceiptModal trade={trade} open={modal === "confirm"} onClose={() => setModal(null)} />
      <CancelModal trade={trade} open={modal === "cancel"} onClose={() => setModal(null)} />
    </Card>
  );
}

function StatusLine({ icon, text, sub, extra }: { icon: React.ReactNode; text: React.ReactNode; sub?: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="font-semibold text-fg">{text}</p>
          {sub && <p className="text-sm text-muted">{sub}</p>}
        </div>
      </div>
      {extra}
    </div>
  );
}

// ── chat ─────────────────────────────────────────────────────────────────────
function Chat({ trade }: { trade: TradeDto }) {
  const t = useTranslations();
  const f = useFmt();
  const err = useErrorText();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["messages", trade.id], queryFn: () => get<MessageDto[]>(`/trades/${trade.id}/messages`) });
  const [text, setText] = useState("");
  const [attach, setAttach] = useState<{ id: string; fileName: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
    if (q.data?.length) void post(`/trades/${trade.id}/read`).catch(() => undefined);
  }, [q.data, trade.id]);

  const send = async () => {
    if (!text.trim() && !attach.length) return;
    setSending(true);
    try {
      await post(`/trades/${trade.id}/messages`, { body: text.trim(), attachmentIds: attach.map((a) => a.id) });
      setText("");
      setAttach([]);
      qc.invalidateQueries({ queryKey: ["messages", trade.id] });
    } catch (e) {
      toast("danger", err(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="flex h-[640px] flex-col overflow-hidden lg:sticky lg:top-24">
      <CardHeader title={t("chat.title")} subtitle={t("chat.rules")} />
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {q.isLoading && <Skeleton className="h-20" />}
        {q.data?.map((m) => {
          if (m.senderRole === "system") {
            const key = m.body.replace(/^sys:/, "");
            return (
              <p key={m.id} className="mx-auto w-fit max-w-[90%] rounded-full bg-surface-2 px-3 py-1 text-center text-xs text-muted">
                {t.has(`sys.${key}` as never) ? t(`sys.${key}` as never) : key} · <span className="num">{f.time(m.createdAt)}</span>
              </p>
            );
          }
          const mine = m.senderRole === trade.myRole;
          const risky = m.riskSignals.some((r) => ["THIRD_PARTY_PAYMENT", "OFF_PLATFORM", "IBAN", "ACCOUNT_NUMBER", "URL"].includes(r));
          return (
            <div key={m.id} className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
              <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2 text-sm", mine ? "rounded-ee-sm bg-accent text-accent-fg" : m.senderRole === "staff" ? "rounded-es-sm border border-info/40 bg-info/10 text-fg" : "rounded-es-sm bg-surface-3 text-fg")}>
                {!mine && <p className="mb-0.5 text-[11px] font-semibold opacity-75">{m.senderRole === "staff" ? t("chat.support") : m.senderName}</p>}
                {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                {m.attachments.map((a) => (
                  <a key={a.id} href={fileUrl(a.id)} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-xs underline">
                    <Paperclip className="size-3" />{a.fileName}
                  </a>
                ))}
              </div>
              {!mine && risky && <p className="flex max-w-[85%] items-start gap-1 text-[11px] text-danger"><ShieldAlert className="mt-0.5 size-3 shrink-0" />{t("chat.warning", { brand: BRAND })}</p>}
              <p className="num flex items-center gap-2 text-[11px] text-subtle">
                {f.time(m.createdAt)}
                {mine && m.readByCounterparty && <span>· {t("chat.read")}</span>}
                {!mine && m.senderRole !== "staff" && (
                  <button className="hover:text-danger" onClick={() => setReportId(m.id)} aria-label={t("chat.report")}><Flag className="size-3" /></button>
                )}
              </p>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="border-t border-border p-3">
        {attach.length > 0 && <div className="mb-2 flex flex-wrap gap-1">{attach.map((a) => <Badge key={a.id}>{a.fileName}</Badge>)}</div>}
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <label className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-md border border-border text-muted hover:bg-surface-2" aria-label={t("chat.attach")}>
            <Paperclip className="size-4" />
            <input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                setAttach((x) => [...x]);
                const r = await upload(file, "CHAT_ATTACHMENT", trade.id);
                setAttach((x) => [...x, r]);
              } catch (er) {
                toast("danger", err(er));
              }
              e.target.value = "";
            }} />
          </label>
          <Textarea rows={1} className="min-h-11 resize-none" placeholder={t("chat.placeholder")} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
          <Button type="submit" loading={sending} aria-label={t("common.send")} className="size-11 shrink-0 p-0"><Send className="size-4 rtl:-scale-x-100" /></Button>
        </form>
      </div>
      <Modal open={!!reportId} onClose={() => setReportId(null)} title={t("chat.report")} footer={
        <Button variant="danger" disabled={reportReason.trim().length < 3} onClick={async () => {
          try {
            await post(`/messages/${reportId}/report`, { reason: reportReason });
            toast("success", t("chat.reported"));
          } catch (e) {
            toast("danger", err(e));
          }
          setReportId(null);
          setReportReason("");
        }}>{t("chat.report")}</Button>
      }>
        <Field label={t("chat.reportReason")}><Textarea value={reportReason} onChange={(e) => setReportReason(e.target.value)} /></Field>
      </Modal>
    </Card>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────
function TradeRoom({ id }: { id: string }) {
  const t = useTranslations();
  const f = useFmt();
  const q = useTrade(id);
  useTradeRoom(id);
  if (q.isError) return <Container><ErrorState title={t("common.errorTitle")} onRetry={() => q.refetch()} retryLabel={t("common.retry")} /></Container>;
  const trade = q.data;
  if (!trade) return <Container><Skeleton className="h-10 w-72" /><Skeleton className="mt-6 h-96" /></Container>;
  const counterparty = trade.myRole === "buyer" ? trade.seller : trade.buyer;
  const isBuyer = trade.myRole === "buyer";
  return (
    <Container>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/trades" className="text-sm text-muted hover:text-fg">{t("trade.historyTitle")}</Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-bold text-fg">
            {t("trade.title", { reference: trade.reference })}
            <TradeStatusBadge status={trade.status} />
          </h1>
          <p className="mt-1 text-sm text-muted">{isBuyer ? t("trade.youAreBuying") : t("trade.youAreSelling")} <Num className="font-semibold text-fg">{f.usdt(trade.amountUsdt)} USDT</Num></p>
        </div>
        {trade.sandbox && <Badge tone="warning">{t("trade.sandboxTrade")}</Badge>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <ActionPanel trade={trade} />
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <p className="text-sm font-semibold text-fg">{t("trade.counterparty")}</p>
              <TraderCell trader={counterparty} />
            </div>
            <KeyValue
              items={[
                { k: t("trade.amount"), v: <Num>{f.usdt(trade.amountUsdt)} USDT</Num> },
                { k: t("trade.price"), v: <Num>{f.price(trade.priceIls)}</Num> },
                { k: t("trade.total"), v: <Num>{f.ils(trade.fiatAmountIls)}</Num>, strong: true },
                { k: t("trade.fee"), v: <Num>{isBuyer ? trade.fee.buyerFeeUsdt : trade.fee.sellerFeeUsdt} USDT</Num> },
                isBuyer ? { k: t("trade.receive"), v: <Num>{f.usdt(trade.buyerReceivesUsdt)} USDT</Num>, strong: true } : { k: t("trade.lock"), v: <Num>{f.usdt(trade.sellerLocksUsdt)} USDT</Num>, strong: true },
                { k: t("market.payment"), v: t(`enums.pm_${trade.paymentMethod}`) },
              ]}
            />
          </Card>
          {trade.events && (
            <Card className="p-5 sm:p-6">
              <p className="mb-4 text-sm font-semibold text-fg">{t("trade.timeline")}</p>
              <ol className="relative space-y-4 border-s border-border ps-5">
                {trade.events.map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute -start-[25px] top-1 size-2.5 rounded-full bg-accent ring-4 ring-surface" />
                    <p className="text-sm font-medium text-fg">{t(`status.${e.toStatus}`)}</p>
                    <p className="num text-xs text-muted">{f.dateTime(e.createdAt)} · {t.has(`trade.actor_${e.actorRole}` as never) ? t(`trade.actor_${e.actorRole}` as never) : e.actorRole}</p>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
        <Chat trade={trade} />
      </div>
    </Container>
  );
}

export default function TradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <RequireAuth>{() => <TradeRoom id={id} />}</RequireAuth>;
}
