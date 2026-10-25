import { Injectable } from "@nestjs/common";
import { findBank, maskAccountNumber, namesMatch, type TraderSummary } from "@wasitx/shared";
import type { RequestContext } from "../../common/auth/auth.types.js";
import { CryptoService } from "../../common/crypto.service.js";
import { AppError, Errors } from "../../common/errors.js";
import { PrismaService } from "../../common/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { toTraderSummary, traderInclude } from "../trades/mappers.js";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  async updateProfile(userId: string, p: { displayName?: string; locale?: "ar" | "he" | "en"; marketingOptIn?: boolean }) {
    await this.prisma.user.update({ where: { id: userId }, data: p });
    return { ok: true };
  }

  async trader(id: string): Promise<TraderSummary & { recentFeedback: { positive: boolean; comment: string | null; createdAt: string }[] }> {
    const u = await this.prisma.user.findUnique({ where: { id }, include: traderInclude });
    if (!u || u.status === "CLOSED") throw Errors.notFound("TRADER");
    const feedback = await this.prisma.rating.findMany({ where: { rateeId: id }, orderBy: { createdAt: "desc" }, take: 10 });
    return { ...toTraderSummary(u), recentFeedback: feedback.map((f) => ({ positive: f.positive, comment: f.comment, createdAt: f.createdAt.toISOString() })) };
  }

  async favorites(userId: string) {
    const rows = await this.prisma.favoriteTrader.findMany({ where: { userId }, include: { trader: { include: traderInclude } } });
    return rows.map((r) => toTraderSummary(r.trader));
  }

  async addFavorite(userId: string, traderId: string) {
    if (userId === traderId) throw new AppError("CANNOT_FAVORITE_SELF", 422);
    await this.prisma.favoriteTrader.upsert({ where: { userId_traderId: { userId, traderId } }, create: { userId, traderId }, update: {} });
    return { ok: true };
  }

  async removeFavorite(userId: string, traderId: string) {
    await this.prisma.favoriteTrader.deleteMany({ where: { userId, traderId } });
    return { ok: true };
  }

  /**
   * Account deletion request. Financial/AML records must be retained (7 years default, see
   * docs/SECURITY.md#retention); the account is closed now and PII is minimised by the retention job.
   */
  async requestDeletion(userId: string, ctx: RequestContext) {
    const open = await this.prisma.trade.count({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }], status: { notIn: ["COMPLETED", "CANCELLED", "EXPIRED"] } },
    });
    if (open) throw new AppError("CLOSE_OPEN_TRADES_FIRST", 409);
    const balances = await this.prisma.ledgerAccount.aggregate({ _sum: { balance: true }, where: { userId } });
    if ((balances._sum.balance ?? 0n) > 0n) throw new AppError("WITHDRAW_BALANCE_FIRST", 409);
    await this.prisma.tx(async (tx) => {
      await tx.offer.updateMany({ where: { ownerId: userId, status: { in: ["ACTIVE", "PAUSED", "EXHAUSTED"] } }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      await tx.user.update({ where: { id: userId }, data: { deletionRequestedAt: new Date(), status: "CLOSED", closedAt: new Date() } });
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: "account_closed" } });
      await this.audit.record(tx, { actorType: "USER", actorId: userId, action: "account.deletion_requested", entityType: "User", entityId: userId, ctx });
    });
    return { ok: true };
  }

  // ── bank accounts ──────────────────────────────────────────────────────────
  async bankAccounts(userId: string) {
    const rows = await this.prisma.bankAccount.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: "desc" } });
    return rows.map((b) => ({
      id: b.id,
      bankCode: b.bankCode,
      bankName: findBank(b.bankCode)?.name ?? { en: b.bankCode, he: b.bankCode, ar: b.bankCode },
      branchNumber: b.branchNumber,
      accountMasked: maskAccountNumber(`000000${b.accountLast4}`),
      holderName: b.holderName,
      status: b.status,
      nameMatchesKyc: b.nameMatchesKyc,
      createdAt: b.createdAt.toISOString(),
    }));
  }

  /**
   * Adds a bank account. It must be in the user's own name (matched against the KYC legal name) — this
   * is what stops payments being routed through third-party accounts.
   */
  async addBankAccount(userId: string, p: { bankCode: string; branchNumber: string; accountNumber: string; holderName: string }, ctx: RequestContext) {
    const bank = findBank(p.bankCode);
    if (!bank) throw new AppError("UNKNOWN_BANK", 422);
    const kyc = await this.prisma.kycProfile.findUnique({ where: { userId } });
    if (kyc?.status !== "APPROVED") throw new AppError("KYC_REQUIRED", 403);
    const count = await this.prisma.bankAccount.count({ where: { userId, deletedAt: null } });
    if (count >= 5) throw new AppError("TOO_MANY_BANK_ACCOUNTS", 422);

    const accountHash = this.crypto.lookupHash(`${bank.code}:${p.branchNumber.padStart(3, "0")}:${p.accountNumber.replace(/^0+/, "")}`);
    const legalName = `${kyc.legalFirstName} ${kyc.legalLastName}`;
    const nameOk = namesMatch(p.holderName, legalName);
    const usedByOther = await this.prisma.bankAccount.findFirst({ where: { accountHash, NOT: { userId }, deletedAt: null }, select: { userId: true } });

    const status = !nameOk ? "REJECTED" : usedByOther ? "PENDING" : "VERIFIED";
    const acct = await this.prisma.tx(async (tx) => {
      const a = await tx.bankAccount.create({
        data: {
          userId,
          bankCode: bank.code,
          branchNumber: p.branchNumber,
          accountNumberEnc: this.crypto.encrypt(p.accountNumber),
          accountLast4: p.accountNumber.slice(-4),
          accountHash,
          holderName: p.holderName,
          nameMatchesKyc: nameOk,
          status,
        },
      });
      if (usedByOther) {
        await tx.riskFlag.create({ data: { userId, type: "SHARED_BANK_ACCOUNT", severity: "HIGH", details: { otherUserId: usedByOther.userId, bankAccountId: a.id } } });
        await tx.complianceCase.create({ data: { type: "SUSPICIOUS_ACTIVITY", userId, priority: "HIGH", summary: "Bank account already registered to another user" } });
      }
      await this.audit.record(tx, { actorType: "USER", actorId: userId, action: "bank_account.added", entityType: "BankAccount", entityId: a.id, data: { status, nameOk }, ctx });
      return a;
    });
    if (status === "REJECTED") throw new AppError("BANK_ACCOUNT_NAME_MISMATCH", 422, undefined, { id: acct.id });
    return (await this.bankAccounts(userId)).find((b) => b.id === acct.id)!;
  }

  async removeBankAccount(userId: string, id: string, ctx: RequestContext) {
    const inUse = await this.prisma.offer.count({ where: { bankAccountId: id, status: { in: ["ACTIVE", "PAUSED", "EXHAUSTED"] } } });
    const inTrade = await this.prisma.trade.count({ where: { sellerBankAccountId: id, status: { notIn: ["COMPLETED", "CANCELLED", "EXPIRED"] } } });
    if (inUse || inTrade) throw new AppError("BANK_ACCOUNT_IN_USE", 409);
    const r = await this.prisma.bankAccount.updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date(), status: "DISABLED" } });
    if (!r.count) throw Errors.notFound("BANK_ACCOUNT");
    await this.audit.recordNow({ actorType: "USER", actorId: userId, action: "bank_account.removed", entityType: "BankAccount", entityId: id, ctx });
    return { ok: true };
  }
}
