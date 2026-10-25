import { env } from "../../../config/env.js";

/** Called by every sandbox adapter before doing anything. Belt-and-braces with the boot check in env.ts. */
export function assertSandboxAllowed(adapter: string): void {
  if (env.TRADING_MODE === "PRODUCTION") {
    throw new Error(`Sandbox adapter "${adapter}" invoked while TRADING_MODE=PRODUCTION — refusing.`);
  }
}

/**
 * In-memory record of messages that sandbox SMS/email/push adapters "sent", exposed at
 * GET /api/v1/dev/outbox (sandbox + non-production only) so demos and tests can read OTPs and links.
 */
export class DevOutbox {
  private static items: { channel: string; to: string; subject?: string; body: string; at: string }[] = [];
  static push(item: { channel: string; to: string; subject?: string; body: string }) {
    DevOutbox.items.unshift({ ...item, at: new Date().toISOString() });
    DevOutbox.items = DevOutbox.items.slice(0, 300);
  }
  static list(to?: string) {
    return to ? DevOutbox.items.filter((i) => i.to === to) : DevOutbox.items;
  }
  static clear() {
    DevOutbox.items = [];
  }
}
