import { divRoundHalfUp, maxBig, minBig } from "./money";

export const FEE_PAYERS = ["BUYER", "SELLER", "SPLIT"] as const;
export type FeePayer = (typeof FEE_PAYERS)[number];

export interface FeeConfig {
  /** Commission in basis points of the USDT amount (75 = 0.75%). */
  rateBps: number;
  minUsdtMicro: bigint;
  maxUsdtMicro: bigint;
  payer: FeePayer;
}

export interface FeeQuote {
  rateBps: number;
  payer: FeePayer;
  /** Total platform commission in micro-USDT. */
  feeUsdtMicro: bigint;
  buyerFeeMicro: bigint;
  sellerFeeMicro: bigint;
  /** USDT the seller must have locked in escrow (trade amount + seller's fee share). */
  sellerLocksMicro: bigint;
  /** USDT credited to the buyer on release (trade amount − buyer's fee share). */
  buyerReceivesMicro: bigint;
}

/** Demo defaults only — the live values come from versioned `CommissionConfig` rows. */
export const DEMO_FEE_CONFIG: FeeConfig = {
  rateBps: 75,
  minUsdtMicro: 1_000_000n,
  maxUsdtMicro: 50_000_000n,
  payer: "BUYER",
};

export function quoteFee(amountMicro: bigint, cfg: FeeConfig): FeeQuote {
  if (amountMicro <= 0n) throw new RangeError("amount must be positive");
  if (cfg.rateBps < 0 || cfg.rateBps > 1000) throw new RangeError("rateBps out of range (0–1000)");
  if (cfg.minUsdtMicro > cfg.maxUsdtMicro) throw new RangeError("min fee exceeds max fee");

  let fee = divRoundHalfUp(amountMicro * BigInt(cfg.rateBps), 10_000n);
  fee = minBig(maxBig(fee, cfg.minUsdtMicro), cfg.maxUsdtMicro);
  if (cfg.rateBps === 0) fee = 0n;

  let buyerFee = 0n;
  let sellerFee = 0n;
  if (cfg.payer === "BUYER") buyerFee = fee;
  else if (cfg.payer === "SELLER") sellerFee = fee;
  else {
    buyerFee = fee / 2n;
    sellerFee = fee - buyerFee;
  }
  // A buyer can never be charged more than the amount they receive.
  if (buyerFee >= amountMicro) throw new RangeError("trade amount too small to cover the commission");

  return {
    rateBps: cfg.rateBps,
    payer: cfg.payer,
    feeUsdtMicro: fee,
    buyerFeeMicro: buyerFee,
    sellerFeeMicro: sellerFee,
    sellerLocksMicro: amountMicro + sellerFee,
    buyerReceivesMicro: amountMicro - buyerFee,
  };
}
