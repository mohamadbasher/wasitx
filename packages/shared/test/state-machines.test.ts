import { describe, expect, it } from "vitest";
import {
  TRADE_STATUSES,
  TRADE_TRANSITIONS,
  availableTradeActions,
  canFreeze,
  canKycTransition,
  canTradeTransition,
  findTradeTransition,
  isTerminalTrade,
  offerTransition,
  tradingIneligibility,
} from "../src";

describe("trade state machine", () => {
  it("has no transitions out of terminal states", () => {
    for (const t of TRADE_TRANSITIONS) expect(isTerminalTrade(t.from)).toBe(false);
  });

  it("only lets the buyer mark paid and only the seller confirm receipt", () => {
    expect(canTradeTransition("AWAITING_FIAT_PAYMENT", "BUYER_MARKED_PAID", "buyer")).toBe(true);
    expect(canTradeTransition("AWAITING_FIAT_PAYMENT", "BUYER_MARKED_PAID", "seller")).toBe(false);
    expect(canTradeTransition("BUYER_MARKED_PAID", "SELLER_CONFIRMED_RECEIPT", "seller")).toBe(true);
    expect(canTradeTransition("BUYER_MARKED_PAID", "SELLER_CONFIRMED_RECEIPT", "buyer")).toBe(false);
  });

  it("never lets a buyer or seller trigger release directly", () => {
    for (const actor of ["buyer", "seller"] as const) {
      for (const from of TRADE_STATUSES) {
        expect(canTradeTransition(from, "RELEASE_PENDING", actor)).toBe(false);
        expect(canTradeTransition(from, "COMPLETED", actor)).toBe(false);
      }
    }
  });

  it("does not let the seller cancel once escrow is locked", () => {
    for (const s of ["ESCROW_CONFIRMED", "AWAITING_FIAT_PAYMENT", "BUYER_MARKED_PAID", "SELLER_CONFIRMED_RECEIPT"] as const) {
      expect(canTradeTransition(s, "CANCELLED", "seller")).toBe(false);
    }
  });

  it("never auto-expires a trade the buyer marked as paid", () => {
    expect(canTradeTransition("BUYER_MARKED_PAID", "EXPIRED", "system")).toBe(false);
    expect(findTradeTransition("BUYER_MARKED_PAID", "expire", "system")).toBeUndefined();
  });

  it("lets a dispute manager resolve either way but not plain support or parties", () => {
    expect(canTradeTransition("DISPUTED", "RELEASE_PENDING", "dispute_manager")).toBe(true);
    expect(canTradeTransition("DISPUTED", "CANCELLED", "dispute_manager")).toBe(true);
    expect(canTradeTransition("DISPUTED", "RELEASE_PENDING", "buyer")).toBe(false);
    expect(canTradeTransition("DISPUTED", "CANCELLED", "seller")).toBe(false);
  });

  it("exposes freeze to compliance from any live state", () => {
    expect(canFreeze("BUYER_MARKED_PAID")).toBe(true);
    expect(canFreeze("COMPLETED")).toBe(false);
    expect(canFreeze("FROZEN")).toBe(false);
    expect(availableTradeActions("DISPUTED", "compliance")).toContain("freeze");
    expect(availableTradeActions("FROZEN", "compliance")).toEqual(expect.arrayContaining(["unfreeze", "cancel_frozen"]));
  });

  it("renders the right buttons per role", () => {
    expect(availableTradeActions("AWAITING_FIAT_PAYMENT", "buyer").sort()).toEqual(["cancel", "mark_paid"]);
    expect(availableTradeActions("AWAITING_FIAT_PAYMENT", "seller")).toEqual([]);
    expect(availableTradeActions("BUYER_MARKED_PAID", "seller").sort()).toEqual(["confirm_receipt", "open_dispute"]);
  });

  it("has every state reachable from OFFER_ACCEPTED", () => {
    const seen = new Set<string>(["OFFER_ACCEPTED"]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const t of TRADE_TRANSITIONS) if (seen.has(t.from) && !seen.has(t.to)) seen.add(t.to), (grew = true);
    }
    seen.add("FROZEN"); // reachable via freeze from any live state
    expect([...seen].sort()).toEqual([...TRADE_STATUSES].sort());
  });
});

describe("offer state machine", () => {
  it("allows owners to pause/resume/cancel but not to unsuspend", () => {
    expect(offerTransition("ACTIVE", "pause", "owner")).toBe("PAUSED");
    expect(offerTransition("PAUSED", "resume", "owner")).toBe("ACTIVE");
    expect(offerTransition("PAUSED", "cancel", "owner")).toBe("CANCELLED");
    expect(offerTransition("SUSPENDED", "unsuspend", "owner")).toBeNull();
    expect(offerTransition("CANCELLED", "resume", "owner")).toBeNull();
  });
});

describe("kyc & eligibility", () => {
  it("guards KYC transitions", () => {
    expect(canKycTransition("NOT_STARTED", "PENDING")).toBe(true);
    expect(canKycTransition("REJECTED", "APPROVED")).toBe(false);
    expect(canKycTransition("RESUBMISSION_REQUIRED", "PENDING")).toBe(true);
  });

  const ok = {
    emailVerified: true,
    phoneVerified: true,
    kycStatus: "APPROVED" as const,
    residencyCountry: "IL",
    isAdult: true,
    sanctionsHit: false,
    accountStatus: "ACTIVE" as const,
  };

  it("requires verified Israeli residency, not phone prefix", () => {
    expect(tradingIneligibility(ok)).toEqual([]);
    expect(tradingIneligibility({ ...ok, residencyCountry: "PS" })).toEqual(["NOT_ISRAELI_RESIDENT"]);
    expect(tradingIneligibility({ ...ok, isAdult: false })).toEqual(["UNDER_18"]);
    expect(tradingIneligibility({ ...ok, kycStatus: "PENDING" })).toEqual(["KYC_NOT_APPROVED"]);
    expect(tradingIneligibility({ ...ok, sanctionsHit: true, accountStatus: "RESTRICTED" })).toEqual([
      "SCREENING_HIT",
      "ACCOUNT_RESTRICTED",
    ]);
  });
});
