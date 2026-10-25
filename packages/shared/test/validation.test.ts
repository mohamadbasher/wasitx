import { describe, expect, it } from "vitest";
import {
  buildIsraeliIban,
  createOfferSchema,
  detectAddressNetwork,
  detectChatRisks,
  isValidEthereumAddress,
  isValidIsraeliIban,
  isValidIsraeliId,
  isValidTronAddress,
  maskSensitive,
  namesMatch,
  normalizeIsraeliMobile,
  registerSchema,
  toChecksumAddress,
} from "../src";

describe("israeli formats", () => {
  it("normalises mobiles to E.164 and rejects landlines/foreign numbers", () => {
    expect(normalizeIsraeliMobile("054-123-4567")).toBe("+972541234567");
    expect(normalizeIsraeliMobile("+972 52 765 4321")).toBe("+972527654321");
    expect(normalizeIsraeliMobile("00972501112233")).toBe("+972501112233");
    expect(normalizeIsraeliMobile("03-1234567")).toBeNull();
    expect(normalizeIsraeliMobile("+15551234567")).toBeNull();
    expect(normalizeIsraeliMobile("0591234567")).toBeNull(); // not in default prefix list
  });

  it("validates Teudat Zehut check digits", () => {
    expect(isValidIsraeliId("000000018")).toBe(true);
    expect(isValidIsraeliId("123456782")).toBe(true);
    expect(isValidIsraeliId("123456789")).toBe(false);
    expect(isValidIsraeliId("000000000")).toBe(false);
  });

  it("builds and validates Israeli IBANs", () => {
    const iban = buildIsraeliIban("12", "345", "123456");
    expect(iban).toMatch(/^IL\d{21}$/);
    expect(isValidIsraeliIban(iban)).toBe(true);
    expect(isValidIsraeliIban("IL620108000000099999999")).toBe(true); // ECBS sample
    expect(isValidIsraeliIban("IL620108000000099999998")).toBe(false);
  });

  it("matches account-holder names across scripts noise", () => {
    expect(namesMatch("מוחמד אגבאריה", "אגבאריה מוחמד")).toBe(true);
    expect(namesMatch("مُحَمَّد إغبارية", "محمد إغبارية")).toBe(true);
    expect(namesMatch("Dana Levi", "DANA  LEVI-COHEN")).toBe(true);
    expect(namesMatch("Dana Levi", "Yossi Levi")).toBe(false);
  });
});

describe("crypto addresses", () => {
  it("validates TRON base58check addresses", () => {
    expect(isValidTronAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")).toBe(true); // USDT contract on TRON
    expect(isValidTronAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u")).toBe(false);
  });

  it("validates EIP-55 checksums", () => {
    const usdt = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // USDT contract on Ethereum
    expect(isValidEthereumAddress(usdt)).toBe(true);
    expect(toChecksumAddress(usdt.toLowerCase())).toBe(usdt);
    expect(isValidEthereumAddress("0xdAC17F958D2ee523a2206206994597C13D831EC7")).toBe(false);
    expect(detectAddressNetwork(usdt)).toBe("ETHEREUM_ERC20");
  });
});

describe("chat safety", () => {
  it("flags payment-redirection attempts in all three languages", () => {
    expect(detectChatRisks("please pay to my friend's account instead")).toContain("THIRD_PARTY_PAYMENT");
    expect(detectChatRisks("תעביר לחשבון אחר בבקשה")).toContain("THIRD_PARTY_PAYMENT");
    expect(detectChatRisks("בוא נמשיך בוואטסאפ")).toContain("OFF_PLATFORM");
    expect(detectChatRisks("حوّل على حساب ثاني")).toContain("THIRD_PARTY_PAYMENT");
    expect(detectChatRisks("كلمني واتساب 0541234567")).toEqual(expect.arrayContaining(["OFF_PLATFORM", "PHONE_NUMBER"]));
    expect(detectChatRisks("sent, thanks")).toEqual([]);
  });

  it("masks account-like digit runs", () => {
    expect(maskSensitive("account 12-345-678901")).toBe("account •••••••8901");
    expect(maskSensitive("ref WX7K3P, 250 ₪")).toBe("ref WX7K3P, 250 ₪");
  });
});

describe("schemas", () => {
  it("requires terms and age confirmation on register", () => {
    const r = registerSchema.safeParse({ email: "a@b.co", password: "correct horse battery", displayName: "Ab", acceptTerms: false, confirmAge: true });
    expect(r.success).toBe(false);
  });

  it("rejects offers where min exceeds max, and SELL offers without a bank account", () => {
    const base = { side: "SELL", amountUsdt: "100", priceIls: "3.7", minOrderIls: "500", maxOrderIls: "100", paymentMethod: "IL_BANK_TRANSFER", expiresInHours: 24 };
    expect(createOfferSchema.safeParse({ ...base, bankAccountId: "clxxxxxxxxxxxx" }).success).toBe(false);
    expect(createOfferSchema.safeParse({ ...base, maxOrderIls: "1000" }).success).toBe(false);
    expect(createOfferSchema.safeParse({ ...base, maxOrderIls: "1000", bankAccountId: "clxxxxxxxxxxxx" }).success).toBe(true);
  });
});
