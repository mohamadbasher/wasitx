import { Injectable } from "@nestjs/common";
import { ageOn, tradingIneligibility, type IneligibilityReason } from "@wasitx/shared";
import { AppError } from "../errors.js";
import { PrismaService } from "../prisma.service.js";

@Injectable()
export class EligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  async reasons(userId: string): Promise<IneligibilityReason[]> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        status: true,
        kyc: { select: { status: true, residencyCountry: true, dateOfBirth: true, sanctionsHit: true } },
      },
    });
    if (!u) return ["ACCOUNT_RESTRICTED"];
    return tradingIneligibility({
      emailVerified: !!u.emailVerifiedAt,
      phoneVerified: !!u.phoneVerifiedAt,
      kycStatus: u.kyc?.status ?? "NOT_STARTED",
      residencyCountry: u.kyc?.residencyCountry ?? null,
      isAdult: u.kyc?.dateOfBirth ? ageOn(u.kyc.dateOfBirth) >= 18 : false,
      sanctionsHit: u.kyc?.sanctionsHit ?? false,
      accountStatus: u.status,
    });
  }

  async assertEligible(userId: string): Promise<void> {
    const r = await this.reasons(userId);
    if (r.length) throw new AppError("NOT_ELIGIBLE_TO_TRADE", 403, undefined, r);
  }
}
