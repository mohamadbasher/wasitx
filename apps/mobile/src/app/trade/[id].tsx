import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams } from "expo-router";
import { Paperclip, Send } from "lucide-react-native";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from "react-native";
import { useTranslations } from "use-intl";
import { countdown, type MessageDto, type TradeDto } from "@wasitx/shared";
import { Badge, Button, Card, Check, Input, Loading, Notice, Row, Screen, T, statusTone, useTheme } from "@/components/ui";
import { BRAND, get, newKey, post, uploadFile } from "@/lib/api";
import { fmt, useErrorText, useLocale } from "@/lib/i18n";
import { getSocket } from "@/lib/session";

function useNow() {
  const [n, setN] = useState(new Date());
  useEffect(() => {
    const h = setInterval(() => setN(new Date()), 1000);
    return () => clearInterval(h);
  }, []);
  return n;
}

function Chat({ trade }: { trade: TradeDto }) {
  const t = useTranslations();
  const c = useTheme();
  const err = useErrorText();
  const { locale, rtl } = useLocale();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["messages", trade.id], queryFn: () => get<MessageDto[]>(`/trades/${trade.id}/messages`) });
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (q.data?.length) void post(`/trades/${trade.id}/read`).catch(() => undefined);
  }, [q.data, trade.id]);
  const send = async (attachmentIds?: string[]) => {
    try {
      await post(`/trades/${trade.id}/messages`, { body: text.trim(), attachmentIds });
      setText("");
      qc.invalidateQueries({ queryKey: ["messages", trade.id] });
    } catch (e) {
      setError(err(e));
    }
  };
  return (
    <Card>
      <T v="h2">{t("chat.title")}</T>
      <T v="small">{t("chat.rules")}</T>
      {error && <Notice tone="danger" text={error} />}
      {q.data?.map((m) => {
        if (m.senderRole === "system") {
          const k = m.body.replace(/^sys:/, "");
          return <T key={m.id} v="small" style={{ textAlign: "center" }}>{t.has(`sys.${k}` as never) ? t(`sys.${k}` as never) : k}</T>;
        }
        const mine = m.senderRole === trade.myRole;
        const risky = m.riskSignals.some((r) => ["THIRD_PARTY_PAYMENT", "OFF_PLATFORM", "IBAN", "ACCOUNT_NUMBER"].includes(r));
        return (
          <View key={m.id} style={{ alignItems: mine ? "flex-end" : "flex-start", gap: 2 }}>
            <View style={{ maxWidth: "85%", borderRadius: 14, padding: 10, backgroundColor: mine ? c.accent : m.senderRole === "staff" ? `${c.info}33` : c.surface3 }}>
              <T v="body" style={{ color: mine ? c.accentFg : c.text }}>{m.body}</T>
              {m.attachments.map((a) => <T key={a.id} v="small" style={{ color: mine ? c.accentFg : c.muted }}>📎 {a.fileName}</T>)}
            </View>
            {!mine && risky && <T v="small" style={{ color: c.danger }}>{t("chat.warning", { brand: BRAND })}</T>}
            <T v="small">{fmt.dateTime(m.createdAt, locale)}{mine && m.readByCounterparty ? ` · ${t("chat.read")}` : ""}</T>
          </View>
        );
      })}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Pressable accessibilityLabel={t("chat.attach")} onPress={async () => {
          const r = await DocumentPicker.getDocumentAsync({ type: ["image/jpeg", "image/png", "application/pdf"] });
          if (r.canceled || !r.assets[0]) return;
          const a = r.assets[0];
          try {
            const f = await uploadFile(a.uri, a.name, a.mimeType ?? "application/octet-stream", "CHAT_ATTACHMENT", trade.id);
            await send([f.id]);
          } catch (e) { setError(err(e)); }
        }} style={{ padding: 10 }}><Paperclip color={c.muted} size={20} /></Pressable>
        <TextInput value={text} onChangeText={setText} placeholder={t("chat.placeholder")} placeholderTextColor={c.subtle} style={{ flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surface2, color: c.text, paddingHorizontal: 12, textAlign: rtl ? "right" : "left" }} />
        <Pressable accessibilityLabel={t("common.send")} disabled={!text.trim()} onPress={() => send()} style={{ padding: 10, backgroundColor: c.accent, borderRadius: 12, opacity: text.trim() ? 1 : 0.5 }}><Send color={c.accentFg} size={18} /></Pressable>
      </View>
    </Card>
  );
}

export default function TradeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const err = useErrorText();
  const qc = useQueryClient();
  const now = useNow();
  const q = useQuery({ queryKey: ["trade", id], queryFn: () => get<TradeDto>(`/trades/${id}`), refetchInterval: (s) => (s.state.data && ["ESCROW_PENDING", "RELEASE_PENDING"].includes(s.state.data.status) ? 2000 : 20_000) });
  const [own, setOwn] = useState(false);
  const [full, setFull] = useState(false);
  const [name, setName] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cleanup = () => undefined as void;
    void getSocket().then((s) => {
      s.emit("trade.join", { tradeId: id });
      const onT = () => qc.invalidateQueries({ queryKey: ["trade", id] });
      const onM = () => qc.invalidateQueries({ queryKey: ["messages", id] });
      s.on("trade.updated", onT);
      s.on("message.created", onM);
      cleanup = () => { s.emit("trade.leave", { tradeId: id }); s.off("trade.updated", onT); s.off("message.created", onM); };
    });
    return () => cleanup();
  }, [id, qc]);

  const act = async (path: string, body: unknown) => {
    setBusy(true);
    setError(null);
    try {
      await post(`/trades/${id}/${path}`, body, newKey());
      qc.invalidateQueries({ queryKey: ["trade", id] });
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  };

  const tr = q.data;
  if (!tr) return <Screen><Loading /></Screen>;
  const buyer = tr.myRole === "buyer";
  const p = tr.paymentInstructions;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Screen>
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <T v="label">{t("trade.title", { reference: tr.reference })}</T>
            <Badge text={t(`status.${tr.status}`)} tone={statusTone(tr.status)} />
          </View>
          <T v="muted">{buyer ? t("trade.youAreBuying") : t("trade.youAreSelling")} {fmt.usdt(tr.amountUsdt)} USDT</T>
          {tr.sandbox && <Badge text={t("trade.sandboxTrade")} tone="warning" />}
        </Card>
        {error && <Notice tone="danger" text={error} />}

        {tr.status === "AWAITING_FIAT_PAYMENT" && buyer && p && (
          <Card>
            <T v="h2">{t("trade.payNow", { amount: fmt.ils(p.amountIls) })}</T>
            {tr.paymentDeadline && <T v="num" style={{ fontSize: 22, color: "#F59E0B" }}>⏱ {countdown(tr.paymentDeadline, now)}</T>}
            <Row k={t("trade.bank")} v={`${p.bankCode} · ${p.bankName}`} />
            <Row k={t("trade.branch")} v={p.branchNumber} />
            <Pressable onPress={() => Clipboard.setStringAsync(p.accountNumber)}><Row k={t("trade.accountNo")} v={`${p.accountNumber}  ⧉`} /></Pressable>
            <Row k={t("trade.holder")} v={p.holderName} strong />
            <Pressable onPress={() => Clipboard.setStringAsync(p.reference)}><Row k={t("trade.reference")} v={`${p.reference}  ⧉`} strong /></Pressable>
            <Notice tone="warning" text={t("trade.payRules")} />
            <Check label={t("trade.paidFromOwn")} value={own} onChange={setOwn} />
            <Button title={t("trade.markPaid")} disabled={!own} loading={busy} onPress={() => act("mark-paid", { paidFromOwnAccount: true })} />
            <Input label={t("trade.cancelReason")} value={reason} onChangeText={setReason} />
            <Notice tone="danger" text={t("trade.cancelWarn")} />
            <Button title={t("trade.cancel")} variant="ghost" disabled={reason.trim().length < 3} onPress={() => act("cancel", { reason })} />
          </Card>
        )}
        {tr.status === "AWAITING_FIAT_PAYMENT" && !buyer && <Notice text={t("status.AWAITING_FIAT_PAYMENT")} />}
        {tr.status === "BUYER_MARKED_PAID" && !buyer && (
          <Card>
            <Notice tone="warning" text={t("trade.sellerCheck", { amount: fmt.ils(tr.fiatAmountIls) })} />
            <T v="muted">{t("trade.sellerCheckRules")}</T>
            <Check label={t("trade.receivedFull")} value={full} onChange={setFull} />
            <Check label={t("trade.senderMatches")} value={name} onChange={setName} />
            <Button title={t("trade.confirmReceipt")} disabled={!full || !name} loading={busy} onPress={() => act("confirm-receipt", { receivedFullAmount: true, senderNameMatches: true })} />
          </Card>
        )}
        {tr.status === "BUYER_MARKED_PAID" && buyer && <Notice text={t("trade.waitingSeller")} />}
        {tr.status === "SELLER_CONFIRMED_RECEIPT" && <Notice tone="warning" text={t("trade.reviewHold")} />}
        {["ESCROW_PENDING", "OFFER_ACCEPTED", "ESCROW_CONFIRMED"].includes(tr.status) && <Notice text={t("trade.escrowLocking")} />}
        {tr.status === "COMPLIANCE_REVIEW" && <Notice tone="warning" text={t("trade.complianceHold")} />}
        {tr.status === "COMPLETED" && <Notice tone="success" text={t("trade.completedBody", { amount: fmt.usdt(tr.buyerReceivesUsdt) })} />}
        {tr.status === "DISPUTED" && <Notice tone="danger" text={t("trade.disputed")} />}
        {tr.status === "FROZEN" && <Notice tone="danger" text={t("trade.frozen")} />}
        {(tr.status === "CANCELLED" || tr.status === "EXPIRED") && <Notice text={tr.status === "EXPIRED" ? t("trade.expired") : t("trade.cancelled")} />}

        <Card>
          <Row k={t("trade.price")} v={fmt.price(tr.priceIls)} />
          <Row k={t("trade.total")} v={fmt.ils(tr.fiatAmountIls)} strong />
          <Row k={t("trade.fee")} v={`${buyer ? tr.fee.buyerFeeUsdt : tr.fee.sellerFeeUsdt} USDT`} />
          <Row k={buyer ? t("trade.receive") : t("trade.lock")} v={`${fmt.usdt(buyer ? tr.buyerReceivesUsdt : tr.sellerLocksUsdt)} USDT`} strong />
        </Card>
        <Chat trade={tr} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
