/**
 * Chat safety: detects attempts to move payment off the verified instructions (a common P2P scam:
 * "pay to my friend's account", "let's continue on WhatsApp") and masks long digit sequences.
 * Detection is advisory — the API flags the message for review and shows a warning; it never
 * silently edits what users wrote beyond masking account-like numbers.
 */

export type ChatRiskSignal = "ACCOUNT_NUMBER" | "IBAN" | "PHONE_NUMBER" | "OFF_PLATFORM" | "THIRD_PARTY_PAYMENT" | "URL";

const OFF_PLATFORM = [
  /whats\s?app|telegram|signal\b|viber|wechat/i,
  /וואטסאפ|ווטסאפ|טלגרם|סיגנל|מחוץ ל(?:אתר|אפליקציה|פלטפורמה)/,
  /واتس|واتساب|تلغرام|تيليجرام|سيجنال|خارج (?:المنصة|التطبيق|الموقع)/,
];

const THIRD_PARTY = [
  /(another|different|other|my friend'?s|new)\s+(bank\s+)?account|pay\s+(to\s+)?(someone|my (brother|friend|wife|husband))/i,
  /חשבון\s+(אחר|חדש|של\s+(חבר|אח|אשתי|בעלי))|תעביר\s+ל(חבר|אח)/,
  /حساب\s+(آخر|ثاني|تاني|جديد|صاحبي|أخوي|اخوي)|حوّ?ل\s+(على|ل)\s*(صاحبي|أخوي|اخوي|حساب\s+ثاني)/,
];

export function detectChatRisks(text: string): ChatRiskSignal[] {
  const s = new Set<ChatRiskSignal>();
  if (/\bIL\s?\d{2}(?:\s?\d){19}\b/i.test(text)) s.add("IBAN");
  if (/(?:\+?972|\b0)5\d[\s-]?\d{3}[\s-]?\d{4}\b/.test(text)) s.add("PHONE_NUMBER");
  // join "123-456 789" style groupings before looking for account-length digit runs
  if (/\b\d{6,13}\b/.test(text.replace(/(\d)[\s-](?=\d)/g, "$1"))) s.add("ACCOUNT_NUMBER");
  if (/https?:\/\/|www\.|t\.me\/|wa\.me\//i.test(text)) s.add("URL");
  if (OFF_PLATFORM.some((r) => r.test(text))) s.add("OFF_PLATFORM");
  if (THIRD_PARTY.some((r) => r.test(text))) s.add("THIRD_PARTY_PAYMENT");
  return [...s];
}

/** Masks digit runs of 6+ (account numbers, IBAN bodies, phones) keeping the last 4 digits. */
export function maskSensitive(text: string): string {
  return text.replace(/\d[\d\s-]{5,}\d/g, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length < 6) return m;
    return `${"•".repeat(digits.length - 4)}${digits.slice(-4)}`;
  });
}
