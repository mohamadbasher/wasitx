import { Inject, Injectable, Logger } from "@nestjs/common";
import type { NotificationDto, Paginated } from "@wasitx/shared";
import { PrismaService } from "../../common/prisma.service.js";
import { EMAIL_PROVIDER, PUSH_PROVIDER, SMS_PROVIDER, type EmailProvider, type PushProvider, type SmsProvider } from "../integrations/providers.js";
import { RealtimeGateway } from "../realtime/realtime.gateway.js";
import { ALWAYS_EMAIL, SMS_WORTHY, renderNotification } from "./templates.js";
import { env } from "../../config/env.js";

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger("Notifications");

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
  ) {}

  async list(userId: string, locale: string, cursor?: string, limit = 20): Promise<Paginated<NotificationDto> & { unread: number }> {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const unread = await this.prisma.notification.count({ where: { userId, readAt: null } });
    const page = rows.slice(0, limit);
    return {
      items: page.map((n) => {
        const r = renderNotification(n.type, locale, n.params as Record<string, string>);
        return { id: n.id, type: n.type, title: r.title, body: r.body, link: n.link, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() };
      }),
      nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
      unread,
    };
  }

  async markRead(userId: string, ids?: string[]) {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
    return { ok: true };
  }

  async preferences(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { notifyEmail: true, notifyPush: true, notifySms: true, marketingOptIn: true } });
    return { email: u.notifyEmail, push: u.notifyPush, sms: u.notifySms, marketing: u.marketingOptIn };
  }

  async setPreferences(userId: string, p: { email: boolean; push: boolean; sms: boolean; marketing: boolean }) {
    await this.prisma.user.update({ where: { id: userId }, data: { notifyEmail: p.email, notifyPush: p.push, notifySms: p.sms, marketingOptIn: p.marketing } });
    return this.preferences(userId);
  }

  async registerPushToken(userId: string, token: string, platform: string) {
    await this.prisma.pushToken.upsert({ where: { token }, create: { userId, token, platform }, update: { userId, platform } });
    return { ok: true };
  }

  /** Outbox handler: realtime ping + channel deliveries per preferences. */
  async deliver(notificationId: string): Promise<void> {
    const n = await this.prisma.notification.findUnique({ where: { id: notificationId }, include: { user: { include: { pushTokens: true } } } });
    if (!n) return;
    const u = n.user;
    const { title, body } = renderNotification(n.type, u.locale, n.params as Record<string, string>);
    this.realtime.toUser(u.id, "notification.created", { id: n.id, type: n.type, title, body, link: n.link });

    const link = n.link ? `${env.WEB_URL}/${u.locale}${n.link}` : env.WEB_URL;
    const jobs: { channel: "EMAIL" | "SMS" | "PUSH"; run: () => Promise<unknown> }[] = [];
    if (u.status !== "CLOSED" && (u.notifyEmail || ALWAYS_EMAIL.has(n.type))) {
      jobs.push({ channel: "EMAIL", run: () => this.email.send({ to: u.email, subject: `${env.BRAND_NAME} — ${title}`, text: `${body}\n\n${link}` }) });
    }
    if (SMS_WORTHY.has(n.type) && u.notifySms && u.phoneE164 && u.phoneVerifiedAt) {
      jobs.push({ channel: "SMS", run: () => this.sms.send(u.phoneE164!, `${env.BRAND_NAME}: ${title}. ${body}`.slice(0, 300)) });
    }
    if (u.notifyPush && u.pushTokens.length) {
      jobs.push({
        channel: "PUSH",
        run: async () => {
          const r = await this.push.send(u.pushTokens.map((t) => t.token), { title, body, data: { link: n.link ?? "" } });
          if (r.invalidTokens.length) await this.prisma.pushToken.deleteMany({ where: { token: { in: r.invalidTokens } } });
        },
      });
    }
    for (const j of jobs) {
      try {
        await j.run();
        await this.prisma.notificationDelivery.create({ data: { notificationId: n.id, channel: j.channel, status: "SENT", attempts: 1, sentAt: new Date() } });
      } catch (e) {
        this.logger.warn(`${j.channel} delivery failed for ${n.id}: ${(e as Error).message}`);
        await this.prisma.notificationDelivery.create({ data: { notificationId: n.id, channel: j.channel, status: "FAILED", attempts: 1, lastError: (e as Error).message } });
      }
    }
  }
}
