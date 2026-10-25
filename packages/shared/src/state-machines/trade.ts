import type { TradeStatus } from "../enums";

/**
 * Trade escrow state machine — see docs/STATE-MACHINES.md §4.
 * `system` = the API itself (jobs, adapter callbacks). Staff actors require the matching permission,
 * which the API checks separately; this table only says which *kind* of actor may ever do it.
 */
export type TradeActor = "buyer" | "seller" | "system" | "compliance" | "dispute_manager";

export type TradeAction =
  | "route_to_review"
  | "pass_compliance"
  | "approve_compliance"
  | "reject_compliance"
  | "escrow_locked"
  | "escrow_failed"
  | "issue_instructions"
  | "mark_paid"
  | "cancel"
  | "expire"
  | "confirm_receipt"
  | "open_dispute"
  | "settlement_verified"
  | "approve_release"
  | "release_confirmed"
  | "resolve_release_to_buyer"
  | "resolve_refund_to_seller"
  | "freeze"
  | "unfreeze"
  | "cancel_frozen";

export interface TradeTransition {
  from: TradeStatus;
  to: TradeStatus;
  action: TradeAction;
  actors: readonly TradeActor[];
}

export const TERMINAL_TRADE_STATUSES: readonly TradeStatus[] = ["COMPLETED", "CANCELLED", "EXPIRED"];

/** States in which the seller's USDT is held by the custodian for this trade. */
export const ESCROW_HELD_STATUSES: readonly TradeStatus[] = [
  "ESCROW_CONFIRMED",
  "AWAITING_FIAT_PAYMENT",
  "BUYER_MARKED_PAID",
  "SELLER_CONFIRMED_RECEIPT",
  "RELEASE_PENDING",
  "DISPUTED",
];

const T = (from: TradeStatus, to: TradeStatus, action: TradeAction, actors: TradeActor[]): TradeTransition => ({
  from,
  to,
  action,
  actors,
});

export const TRADE_TRANSITIONS: readonly TradeTransition[] = [
  T("OFFER_ACCEPTED", "COMPLIANCE_REVIEW", "route_to_review", ["system"]),
  T("OFFER_ACCEPTED", "ESCROW_PENDING", "pass_compliance", ["system"]),
  T("COMPLIANCE_REVIEW", "ESCROW_PENDING", "approve_compliance", ["compliance"]),
  T("COMPLIANCE_REVIEW", "CANCELLED", "reject_compliance", ["compliance", "system"]),
  T("ESCROW_PENDING", "ESCROW_CONFIRMED", "escrow_locked", ["system"]),
  T("ESCROW_PENDING", "CANCELLED", "escrow_failed", ["system"]),
  T("ESCROW_CONFIRMED", "AWAITING_FIAT_PAYMENT", "issue_instructions", ["system"]),
  T("AWAITING_FIAT_PAYMENT", "BUYER_MARKED_PAID", "mark_paid", ["buyer"]),
  T("AWAITING_FIAT_PAYMENT", "CANCELLED", "cancel", ["buyer"]),
  T("AWAITING_FIAT_PAYMENT", "EXPIRED", "expire", ["system"]),
  T("BUYER_MARKED_PAID", "SELLER_CONFIRMED_RECEIPT", "confirm_receipt", ["seller"]),
  T("BUYER_MARKED_PAID", "DISPUTED", "open_dispute", ["buyer", "seller"]),
  T("SELLER_CONFIRMED_RECEIPT", "RELEASE_PENDING", "settlement_verified", ["system"]),
  T("SELLER_CONFIRMED_RECEIPT", "RELEASE_PENDING", "approve_release", ["compliance"]),
  T("RELEASE_PENDING", "COMPLETED", "release_confirmed", ["system"]),
  T("DISPUTED", "RELEASE_PENDING", "resolve_release_to_buyer", ["dispute_manager"]),
  T("DISPUTED", "CANCELLED", "resolve_refund_to_seller", ["dispute_manager"]),
  T("FROZEN", "CANCELLED", "cancel_frozen", ["compliance"]),
];

/** Freezing is allowed from every non-terminal, non-frozen state; unfreezing returns to `frozenFrom`. */
export function canFreeze(from: TradeStatus): boolean {
  return !TERMINAL_TRADE_STATUSES.includes(from) && from !== "FROZEN";
}

export function findTradeTransition(
  from: TradeStatus,
  action: TradeAction,
  actor: TradeActor,
): TradeTransition | undefined {
  return TRADE_TRANSITIONS.find((t) => t.from === from && t.action === action && t.actors.includes(actor));
}

export function canTradeTransition(from: TradeStatus, to: TradeStatus, actor: TradeActor): boolean {
  return TRADE_TRANSITIONS.some((t) => t.from === from && t.to === to && t.actors.includes(actor));
}

/** Actions a participant/staff member may take right now — used by clients to render buttons. */
export function availableTradeActions(status: TradeStatus, actor: TradeActor): TradeAction[] {
  const actions = TRADE_TRANSITIONS.filter((t) => t.from === status && t.actors.includes(actor)).map((t) => t.action);
  if (actor === "compliance") {
    if (canFreeze(status)) actions.push("freeze");
    if (status === "FROZEN") actions.push("unfreeze");
  }
  return actions;
}

export const isTerminalTrade = (s: TradeStatus) => TERMINAL_TRADE_STATUSES.includes(s);

/** Ordered happy path, for progress timelines in the UI. */
export const TRADE_HAPPY_PATH: readonly TradeStatus[] = [
  "OFFER_ACCEPTED",
  "ESCROW_CONFIRMED",
  "AWAITING_FIAT_PAYMENT",
  "BUYER_MARKED_PAID",
  "SELLER_CONFIRMED_RECEIPT",
  "COMPLETED",
];
