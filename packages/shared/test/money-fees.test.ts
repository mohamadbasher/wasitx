import { describe, expect, it } from "vitest";
import {
  DEMO_FEE_CONFIG,
  fiatForUsdt,
  formatIls,
  formatPrice,
  formatUsdt,
  parseIls,
  parsePrice,
  parseUsdt,
  quoteFee,
  usdtForFiat,
} from "../src";

describe("money parsing", () => {
  it("parses decimal strings into exact minor units", () => {
    expect(parseUsdt("1")).toBe(1_000_000n);
    expect(parseUsdt("0.000001")).toBe(1n);
    expect(parseUsdt("1234.5")).toBe(1_234_500_000n);
    expect(parseIls("3.7")).toBe(370n);
    expect(parsePrice("3.7251")).toBe(37_251n);
  });

  it("rejects floats in disguise, signs, exponents and excess precision", () => {
    for (const bad of ["-1", "1e6", "1.0000001", "", ".5", "1,000", "0x10", "1.2.3"]) {
      expect(() => parseUsdt(bad)).toThrow();
    }
    expect(() => parseIls("1.001")).toThrow();
  });

  it("round-trips formatting", () => {
    expect(formatUsdt(1_234_500_000n)).toBe("1234.50");
    expect(formatUsdt(1n)).toBe("0.000001");
    expect(formatIls(370n)).toBe("3.70");
    expect(formatPrice(37_250n)).toBe("3.725");
  });
});

describe("fiat conversion", () => {
  it("computes agorot with half-up rounding", () => {
    // 100 USDT × 3.7250 = 372.50 ₪
    expect(fiatForUsdt(parseUsdt("100"), parsePrice("3.725"))).toBe(37_250n);
    // 0.333333 USDT × 3.0001 = 1.000032... ₪ → 1.00
    expect(fiatForUsdt(parseUsdt("0.333333"), parsePrice("3.0001"))).toBe(100n);
    // 1.5 agorot boundary: 0.004 USDT × 3.75 = 0.015 ₪ → 0.02
    expect(fiatForUsdt(parseUsdt("0.004"), parsePrice("3.75"))).toBe(2n);
  });

  it("converts fiat to USDT rounding down (buyer never over-credited)", () => {
    expect(usdtForFiat(parseIls("372.50"), parsePrice("3.725"))).toBe(parseUsdt("100"));
    expect(usdtForFiat(parseIls("1"), parsePrice("3"))).toBe(333_333n);
  });

  it("never loses value to float error on large amounts", () => {
    const amt = parseUsdt("987654321.123456");
    const price = parsePrice("3.9999");
    // exact: 987654321.123456 × 3.9999 = 3950518519.0617116544 ₪
    expect(fiatForUsdt(amt, price)).toBe(395_051_851_906n);
  });
});

describe("fees", () => {
  it("applies the demo 0.75% buyer-paid commission", () => {
    const q = quoteFee(parseUsdt("1000"), DEMO_FEE_CONFIG);
    expect(q.feeUsdtMicro).toBe(parseUsdt("7.5"));
    expect(q.buyerReceivesMicro).toBe(parseUsdt("992.5"));
    expect(q.sellerLocksMicro).toBe(parseUsdt("1000"));
  });

  it("clamps to min and max", () => {
    expect(quoteFee(parseUsdt("10"), DEMO_FEE_CONFIG).feeUsdtMicro).toBe(parseUsdt("1"));
    expect(quoteFee(parseUsdt("100000"), DEMO_FEE_CONFIG).feeUsdtMicro).toBe(parseUsdt("50"));
  });

  it("supports seller-paid and split fees", () => {
    const seller = quoteFee(parseUsdt("1000"), { ...DEMO_FEE_CONFIG, payer: "SELLER" });
    expect(seller.sellerLocksMicro).toBe(parseUsdt("1007.5"));
    expect(seller.buyerReceivesMicro).toBe(parseUsdt("1000"));

    const split = quoteFee(parseUsdt("1000"), { ...DEMO_FEE_CONFIG, payer: "SPLIT" });
    expect(split.buyerFeeMicro + split.sellerFeeMicro).toBe(split.feeUsdtMicro);
    expect(split.buyerFeeMicro).toBe(3_750_000n);
  });

  it("refuses trades too small to cover the buyer's commission", () => {
    expect(() => quoteFee(parseUsdt("0.5"), DEMO_FEE_CONFIG)).toThrow();
  });

  it("conserves value: seller lock = buyer receives + total fee", () => {
    for (const payer of ["BUYER", "SELLER", "SPLIT"] as const) {
      for (const a of ["5", "133.333333", "4999.99", "250000"]) {
        const q = quoteFee(parseUsdt(a), { ...DEMO_FEE_CONFIG, payer });
        expect(q.sellerLocksMicro).toBe(q.buyerReceivesMicro + q.feeUsdtMicro);
      }
    }
  });
});
