import { Injectable } from "@nestjs/common";
import { permissionsFor, type Role } from "@wasitx/shared";
import { CryptoService } from "../crypto.service.js";
import { PrismaService } from "../prisma.service.js";
import type { AuthUser } from "./auth.types.js";

/** Grace period during which an access token of a just-rotated session stays valid (parallel requests). */
const ROTATION_GRACE_MS = 30_000;

@Injectable()
export class SessionResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  /** Validates the token signature/expiry, then checks the session is live and the account usable. */
  async resolve(token: string, via: AuthUser["via"]): Promise<AuthUser | null> {
    const claims = this.crypto.verifyAccessToken(token);
    if (!claims) return null;
    const session = await this.prisma.session.findUnique({
      where: { id: claims.sessionId },
      select: {
        userId: true,
        revokedAt: true,
        revokeReason: true,
        expiresAt: true,
        mfaVerified: true,
        user: { select: { status: true, roles: { select: { role: true } } } },
      },
    });
    if (!session || session.userId !== claims.userId) return null;
    if (session.revokedAt) {
      const rotatedRecently = session.revokeReason === "rotated" && Date.now() - session.revokedAt.getTime() < ROTATION_GRACE_MS;
      if (!rotatedRecently) return null;
    }
    if (session.expiresAt < new Date()) return null;
    if (session.user.status === "SUSPENDED" || session.user.status === "CLOSED") return null;

    const roles = session.user.roles.map((r) => r.role as Role);
    return {
      id: session.userId,
      sessionId: claims.sessionId,
      roles,
      permissions: permissionsFor(roles),
      mfaVerified: session.mfaVerified,
      via,
    };
  }
}
