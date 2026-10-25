/** Israeli identifiers & formats. Pure functions, shared by API (authoritative) and clients (UX). */

/** Israeli mobile prefixes accepted at launch (configurable on the API via `phone.allowedPrefixes`). */
export const DEFAULT_IL_MOBILE_PREFIXES = ["50", "51", "52", "53", "54", "55", "58"] as const;

/**
 * Normalises an Israeli mobile number to E.164 (+9725XXXXXXXX). Accepts "054-123-4567", "0541234567",
 * "+972 54 123 4567", "972541234567". Returns null if not a valid Israeli mobile.
 */
export function normalizeIsraeliMobile(
  input: string,
  allowedPrefixes: readonly string[] = DEFAULT_IL_MOBILE_PREFIXES,
): string | null {
  let d = input.replace(/[\s\-().]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("972")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  if (!/^5\d{8}$/.test(d)) return null;
  if (!allowedPrefixes.includes(d.slice(0, 2))) return null;
  return `+972${d}`;
}

/** Masks a phone for display: +972 54-***-4567 */
export function maskPhone(e164: string): string {
  const local = e164.replace(/^\+972/, "");
  return `+972 ${local.slice(0, 2)}-***-${local.slice(-4)}`;
}

/** Teudat Zehut (Israeli ID number) check digit validation. */
export function isValidIsraeliId(input: string): boolean {
  const id = input.trim();
  if (!/^\d{5,9}$/.test(id)) return false;
  const padded = id.padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(padded[i]) * ((i % 2) + 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0 && padded !== "000000000";
}

export interface IsraeliBank {
  code: string;
  name: { en: string; he: string; ar: string };
}

/** Banks operating retail accounts in Israel (Bank of Israel codes). Admin can disable entries. */
export const ISRAELI_BANKS: readonly IsraeliBank[] = [
  { code: "10", name: { en: "Bank Leumi", he: "בנק לאומי", ar: "بنك لئومي" } },
  { code: "12", name: { en: "Bank Hapoalim", he: "בנק הפועלים", ar: "بنك هبوعليم" } },
  { code: "11", name: { en: "Israel Discount Bank", he: "בנק דיסקונט", ar: "بنك ديسكونت" } },
  { code: "20", name: { en: "Mizrahi-Tefahot Bank", he: "בנק מזרחי טפחות", ar: "بنك مزراحي طفحوت" } },
  { code: "31", name: { en: "First International Bank", he: "הבנק הבינלאומי", ar: "البنك الدولي الأول" } },
  { code: "17", name: { en: "Mercantile Discount Bank", he: "בנק מרכנתיל דיסקונט", ar: "بنك مركنتيل ديسكونت" } },
  { code: "54", name: { en: "Bank of Jerusalem", he: "בנק ירושלים", ar: "بنك القدس" } },
  { code: "04", name: { en: "Bank Yahav", he: "בנק יהב", ar: "بنك يهاف" } },
  { code: "46", name: { en: "Bank Massad", he: "בנק מסד", ar: "بنك مساد" } },
  { code: "14", name: { en: "Otsar Ha-Hayal", he: "בנק אוצר החייל", ar: "بنك أوتسار هحايال" } },
  { code: "52", name: { en: "Poalei Agudat Israel", he: "בנק פועלי אגודת ישראל", ar: "بنك بوعالي أغودات يسرائيل" } },
  { code: "09", name: { en: "Postal Bank", he: "בנק הדואר", ar: "بنك البريد" } },
  { code: "18", name: { en: "One Zero Digital Bank", he: "וואן זירו", ar: "وان زيرو" } },
];

export const findBank = (code: string) => ISRAELI_BANKS.find((b) => b.code === code.padStart(2, "0"));

/** Israeli IBAN: IL + 2 check digits + 3 bank + 3 branch + 13 account (23 chars), ISO 13616 mod-97. */
export function isValidIsraeliIban(input: string): boolean {
  const iban = input.replace(/\s/g, "").toUpperCase();
  if (!/^IL\d{21}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}

/** Builds an Israeli IBAN from bank/branch/account parts (computes the check digits). */
export function buildIsraeliIban(bank: string, branch: string, account: string): string {
  const bban = bank.padStart(3, "0") + branch.padStart(3, "0") + account.padStart(13, "0");
  const numeric = (bban + "IL00").replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  return `IL${String(98 - rem).padStart(2, "0")}${bban}`;
}

export function maskAccountNumber(account: string): string {
  return account.length <= 4 ? "****" : `${"•".repeat(Math.min(6, account.length - 4))}${account.slice(-4)}`;
}

/**
 * Normalises a person's name for account-holder matching across Hebrew / Arabic / Latin input:
 * strips diacritics (niqqud, harakat), punctuation and extra whitespace, lowercases Latin.
 */
export function normalizePersonName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[֑-ׇً-ٰٟ̀-ͯ]/g, "")
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** True when every token of the shorter name appears in the longer one (order-insensitive). */
export function namesMatch(a: string, b: string): boolean {
  const ta = normalizePersonName(a).split(" ").filter(Boolean);
  const tb = normalizePersonName(b).split(" ").filter(Boolean);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.length >= Math.min(2, long.length) && short.every((t) => long.includes(t));
}
