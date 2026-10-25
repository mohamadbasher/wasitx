import type { OfferStatus } from "../enums";

export type OfferActor = "owner" | "system" | "staff";
export type OfferAction = "pause" | "resume" | "cancel" | "exhaust" | "replenish" | "expire" | "suspend" | "unsuspend";

interface OfferTransition {
  from: readonly OfferStatus[];
  to: OfferStatus;
  action: OfferAction;
  actors: readonly OfferActor[];
}

export const OFFER_TRANSITIONS: readonly OfferTransition[] = [
  { from: ["ACTIVE"], to: "PAUSED", action: "pause", actors: ["owner", "staff"] },
  { from: ["PAUSED"], to: "ACTIVE", action: "resume", actors: ["owner"] },
  { from: ["ACTIVE", "PAUSED", "EXHAUSTED"], to: "CANCELLED", action: "cancel", actors: ["owner", "staff"] },
  { from: ["ACTIVE"], to: "EXHAUSTED", action: "exhaust", actors: ["system"] },
  { from: ["EXHAUSTED"], to: "ACTIVE", action: "replenish", actors: ["system"] },
  { from: ["ACTIVE", "PAUSED", "EXHAUSTED"], to: "EXPIRED", action: "expire", actors: ["system"] },
  { from: ["ACTIVE", "PAUSED", "EXHAUSTED"], to: "SUSPENDED", action: "suspend", actors: ["staff"] },
  { from: ["SUSPENDED"], to: "PAUSED", action: "unsuspend", actors: ["staff"] },
];

export function offerTransition(from: OfferStatus, action: OfferAction, actor: OfferActor): OfferStatus | null {
  const t = OFFER_TRANSITIONS.find((x) => x.action === action && x.from.includes(from) && x.actors.includes(actor));
  return t ? t.to : null;
}

/** Fields the owner may edit, and when. */
export const OFFER_EDITABLE_STATUSES: readonly OfferStatus[] = ["ACTIVE", "PAUSED", "EXHAUSTED"];
export const OFFER_OPEN_STATUSES: readonly OfferStatus[] = ["ACTIVE", "PAUSED", "EXHAUSTED"];
