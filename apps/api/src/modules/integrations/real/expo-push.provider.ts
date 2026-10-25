import { Logger } from "@nestjs/common";
import type { PushProvider } from "../providers.js";

/**
 * Expo Push Service (public, documented API: https://docs.expo.dev/push-notifications/sending-notifications/).
 * Sends in batches of 100 and reports tokens Expo marks as DeviceNotRegistered so they can be pruned.
 */
export class ExpoPushProvider implements PushProvider {
  readonly name = "expo-push";
  readonly sandbox = false;
  private readonly logger = new Logger("ExpoPush");

  async send(tokens: string[], msg: { title: string; body: string; data?: Record<string, string> }) {
    const valid = tokens.filter((t) => /^Expo(nent)?PushToken\[.+\]$/.test(t));
    const invalidTokens: string[] = tokens.filter((t) => !valid.includes(t));
    let sent = 0;
    for (let i = 0; i < valid.length; i += 100) {
      const batch = valid.slice(i, i + 100);
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(batch.map((to) => ({ to, title: msg.title, body: msg.body, data: msg.data ?? {}, sound: "default" }))),
      });
      if (!res.ok) {
        this.logger.warn(`Expo push HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      json.data?.forEach((ticket, idx) => {
        if (ticket.status === "ok") sent++;
        else if (ticket.details?.error === "DeviceNotRegistered") invalidTokens.push(batch[idx]!);
      });
    }
    return { sent, invalidTokens };
  }
}
