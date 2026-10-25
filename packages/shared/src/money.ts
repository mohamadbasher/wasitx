/**
 * Money arithmetic. All amounts are integer minor units held in `bigint`:
 *   USDT  — micro-USDT (6 decimals, matches the USDT token on TRON/Ethereum)
 *   ILS   — agorot (2 decimals)
 *   price — ILS per 1 USDT with 4 decimals ("priceE4"), e.g. 3.7250 ₪ → 37250n
 * Over the wire amounts are decimal strings; JavaScript numbers are never used for money.
 */

export const USDT_DECIMALS = 6;
export const ILS_DECIMALS = 2;
export const PRICE_DECIMALS = 4;

const pow10 = (n: number): bigint => 10n ** BigInt(n);

export class MoneyFormatError extends Error {
  constructor(input: string, decimals: number) {
    super(`Invalid amount "${input}" (max ${decimals} decimals)`);
  }
}

/** Parses a non-negative decimal string into minor units. Rejects exponents, signs and excess precision. */
export function parseDecimal(input: string, decimals: number): bigint {
  const s = input.trim();
  const re = new RegExp(`^(\\d{1,18})(?:\\.(\\d{1,${decimals}}))?$`);
  const m = re.exec(s);
  if (!m) throw new MoneyFormatError(input, decimals);
  const whole = BigInt(m[1]!);
  const frac = (m[2] ?? "").padEnd(decimals, "0");
  return whole * pow10(decimals) + BigInt(frac || "0");
}

/** Formats minor units as a plain decimal string, trimming trailing zeros down to `minFraction`. */
export function formatDecimal(value: bigint, decimals: number, minFraction = 0): string {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const base = pow10(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0");
  while (frac.length > minFraction && frac.endsWith("0")) frac = frac.slice(0, -1);
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

export const parseUsdt = (s: string) => parseDecimal(s, USDT_DECIMALS);
export const parseIls = (s: string) => parseDecimal(s, ILS_DECIMALS);
export const parsePrice = (s: string) => parseDecimal(s, PRICE_DECIMALS);
export const formatUsdt = (v: bigint) => formatDecimal(v, USDT_DECIMALS, 2);
export const formatIls = (v: bigint) => formatDecimal(v, ILS_DECIMALS, 2);
export const formatPrice = (v: bigint) => formatDecimal(v, PRICE_DECIMALS, 2);

/** Integer division rounding half away from zero (operands are non-negative in practice). */
export function divRoundHalfUp(n: bigint, d: bigint): bigint {
  if (d <= 0n) throw new RangeError("divisor must be positive");
  if (n < 0n) return -divRoundHalfUp(-n, d);
  return (n + d / 2n) / d;
}

export function divCeil(n: bigint, d: bigint): bigint {
  if (d <= 0n || n < 0n) throw new RangeError("ceil division expects n >= 0, d > 0");
  return (n + d - 1n) / d;
}

/** micro-USDT × priceE4 → agorot. 10^6 (USDT) × 10^4 (price) / 10^2 (agorot) = 10^8. Half-up rounding. */
export function fiatForUsdt(usdtMicro: bigint, priceE4: bigint): bigint {
  return divRoundHalfUp(usdtMicro * priceE4, pow10(USDT_DECIMALS + PRICE_DECIMALS - ILS_DECIMALS));
}

/** agorot → micro-USDT at a price, rounded down so a buyer never receives more than they pay for. */
export function usdtForFiat(agorot: bigint, priceE4: bigint): bigint {
  if (priceE4 <= 0n) throw new RangeError("price must be positive");
  return (agorot * pow10(USDT_DECIMALS + PRICE_DECIMALS - ILS_DECIMALS)) / priceE4;
}

export const minBig = (a: bigint, b: bigint) => (a < b ? a : b);
export const maxBig = (a: bigint, b: bigint) => (a > b ? a : b);

/** Locale-aware display (UI only — never feed the result back into calculations). */
export function displayIls(agorot: bigint, locale: string): string {
  const s = formatIls(agorot);
  const [w, f = "00"] = s.split(".");
  const grouped = new Intl.NumberFormat(locale === "ar" ? "ar-IL-u-nu-latn" : locale).format(BigInt(w!));
  return `₪${grouped}.${f.padEnd(2, "0")}`;
}

export function displayUsdt(micro: bigint, locale: string): string {
  const s = formatUsdt(micro);
  const [w, f] = s.split(".");
  const grouped = new Intl.NumberFormat(locale === "ar" ? "ar-IL-u-nu-latn" : locale).format(BigInt(w!));
  return `${grouped}${f ? `.${f}` : ""} USDT`;
}
