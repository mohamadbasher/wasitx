import { Logger } from "@nestjs/common";
import { ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { SessionResolver } from "../../common/auth/session-resolver.service.js";
import { COOKIE_ACCESS, type AuthUser } from "../../common/auth/auth.types.js";
import { PrismaService } from "../../common/prisma.service.js";
import { corsOrigins } from "../../config/env.js";

function readCookie(header: string | undefined, name: string): string | undefined {
  return header
    ?.split(";")
    .map((c) => c.trim().split("="))
    .find(([k]) => k === name)?.[1];
}

/**
 * Socket.IO gateway. Pushes lightweight "something changed" events; clients refetch through REST so
 * per-viewer redaction (bank details, staff notes) is enforced in exactly one place.
 * Rooms: user:<id> (auto), trade:<id> (party or staff only), market (public).
 */
@WebSocketGateway({ namespace: "/ws", cors: { origin: corsOrigins(), credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger("Realtime");

  constructor(
    private readonly sessions: SessionResolver,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    const token = (client.handshake.auth?.token as string | undefined) ?? readCookie(client.handshake.headers.cookie, COOKIE_ACCESS);
    const user = token ? await this.sessions.resolve(decodeURIComponent(token), "bearer") : null;
    client.data.user = user;
    await client.join("market");
    if (user) await client.join(`user:${user.id}`);
  }

  @SubscribeMessage("trade.join")
  async joinTrade(@ConnectedSocket() client: Socket, @MessageBody() body: { tradeId?: string }) {
    const user = client.data.user as AuthUser | null;
    if (!user || typeof body?.tradeId !== "string") return { ok: false };
    const t = await this.prisma.trade.findUnique({ where: { id: body.tradeId }, select: { buyerId: true, sellerId: true } });
    const allowed = t && (t.buyerId === user.id || t.sellerId === user.id || user.permissions.has("trades:read_all"));
    if (!allowed) return { ok: false };
    await client.join(`trade:${body.tradeId}`);
    return { ok: true };
  }

  @SubscribeMessage("trade.leave")
  async leaveTrade(@ConnectedSocket() client: Socket, @MessageBody() body: { tradeId?: string }) {
    if (typeof body?.tradeId === "string") await client.leave(`trade:${body.tradeId}`);
    return { ok: true };
  }

  @SubscribeMessage("trade.typing")
  typing(@ConnectedSocket() client: Socket, @MessageBody() body: { tradeId?: string }) {
    const user = client.data.user as AuthUser | null;
    if (!user || typeof body?.tradeId !== "string" || !client.rooms.has(`trade:${body.tradeId}`)) return;
    client.to(`trade:${body.tradeId}`).emit("trade.typing", { tradeId: body.tradeId, userId: user.id });
  }

  toTrade(tradeId: string, event: string, payload: unknown) {
    this.server?.to(`trade:${tradeId}`).emit(event, payload);
  }

  toUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  toMarket(event: string, payload: unknown) {
    this.server?.to("market").emit(event, payload);
  }
}
