/**
 * Seeds baseline configuration and (sandbox only) demo users/offers by calling the real services,
 * so demo data goes through the same validation, ledger and custody paths as user actions.
 * Usage: pnpm --filter @wasitx/api build && pnpm --filter @wasitx/api seed
 */
import "reflect-metadata";
process.env.JOBS_ENABLED = "false";
import { NestFactory } from "@nestjs/core";
import { hash } from "@node-rs/argon2";
import { AppModule } from "./app.module.js";
import { PrismaService } from "./common/prisma.service.js";
import { env, isSandbox } from "./config/env.js";
import type { AuthUser, RequestContext } from "./common/auth/auth.types.js";
import { permissionsFor, type Role } from "@wasitx/shared";
import { KycService } from "./modules/kyc/kyc.service.js";
import { UsersService } from "./modules/users/users.service.js";
import { WalletService } from "./modules/wallet/wallet.service.js";
import { OffersService } from "./modules/offers/offers.service.js";

const ctx: RequestContext = { ip: "127.0.0.1", userAgent: "seed", deviceId: null };
const DEMO_PASSWORD = "Sandbox-Demo-Pass-2026"; // sandbox demo accounts only

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const prisma = app.get(PrismaService);

  // ── baseline configuration (all environments) ──────────────────────────────
  const methods = [
    { code: "IL_BANK_TRANSFER", enabled: true, displayOrder: 1, note: "Israeli bank transfer — launch method" },
    { code: "IL_INSTANT_TRANSFER", enabled: true, displayOrder: 2, note: "Instant bank transfer where supported by both banks" },
    { code: "BIT", enabled: false, displayOrder: 3, note: "Disabled until provider terms confirm crypto-related use is permitted" },
    { code: "PAYBOX", enabled: false, displayOrder: 4, note: "Disabled until provider terms confirm crypto-related use is permitted" },
  ] as const;
  for (const m of methods) await prisma.paymentMethodConfig.upsert({ where: { code: m.code }, create: m, update: {} });

  await prisma.networkConfig.upsert({
    where: { code: "TRON_TRC20" },
    create: {
      code: "TRON_TRC20",
      enabled: isSandbox(),
      label: "TRON (TRC-20)",
      tokenContract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      minConfirmations: 20,
      withdrawalFeeUsdt: 1_000_000n,
      minWithdrawalUsdt: 10_000_000n,
      note: "SANDBOX ONLY — custodian support not verified; re-verify contract before production",
    },
    update: {},
  });
  await prisma.networkConfig.upsert({
    where: { code: "ETHEREUM_ERC20" },
    create: {
      code: "ETHEREUM_ERC20",
      enabled: false,
      label: "Ethereum (ERC-20)",
      tokenContract: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      minConfirmations: 12,
      withdrawalFeeUsdt: 5_000_000n,
      minWithdrawalUsdt: 50_000_000n,
      note: "Disabled — evaluate fees and custodian support first",
    },
    update: {},
  });
  if (!(await prisma.commissionConfig.count())) {
    await prisma.commissionConfig.create({ data: { rateBps: 75, minUsdt: 1_000_000n, maxUsdt: 50_000_000n, payer: "BUYER", note: "Illustrative demo default (0.75%, buyer pays)" } });
  }

  // ── staff accounts (dev/sandbox) ───────────────────────────────────────────
  if (isSandbox() && env.NODE_ENV !== "production") {
    const staff: { email: string; name: string; roles: Role[] }[] = [
      { email: "owner@wasitx.local", name: "Owner", roles: ["USER", "SUPER_ADMIN"] },
      { email: "admin@wasitx.local", name: "Operations Admin", roles: ["USER", "ADMIN"] },
      { email: "compliance@wasitx.local", name: "Compliance Officer", roles: ["USER", "COMPLIANCE_OFFICER"] },
      { email: "disputes@wasitx.local", name: "Dispute Manager", roles: ["USER", "DISPUTE_MANAGER"] },
      { email: "support@wasitx.local", name: "Support Agent", roles: ["USER", "SUPPORT_AGENT"] },
    ];
    const passwordHash = await hash(DEMO_PASSWORD, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    for (const s of staff) {
      await prisma.user.upsert({
        where: { email: s.email },
        create: {
          email: s.email,
          passwordHash,
          displayName: s.name,
          locale: "en",
          emailVerifiedAt: new Date(),
          roles: { create: s.roles.map((role) => ({ role })) },
          kyc: { create: {} },
          stats: { create: {} },
        },
        update: {},
      });
    }

    // ── demo traders, created through the real services ──────────────────────
    const kyc = app.get(KycService);
    const users = app.get(UsersService);
    const wallet = app.get(WalletService);
    const offers = app.get(OffersService);
    const demo = [
      { email: "rania@demo.local", name: "Rania", first: "Rania", last: "Khoury", id: "000000018", phone: "+972521110001", bank: "12", branch: "601", acct: "123456", locale: "ar" as const },
      { email: "yossi@demo.local", name: "Yossi", first: "Yossi", last: "Levi", id: "123456782", phone: "+972541110002", bank: "10", branch: "802", acct: "654321", locale: "he" as const },
      { email: "omar@demo.local", name: "Omar", first: "Omar", last: "Haddad", id: "000000026", phone: "+972501110003", bank: "11", branch: "100", acct: "778899", locale: "ar" as const },
    ];
    for (const d of demo) {
      if (await prisma.user.findUnique({ where: { email: d.email } })) continue;
      const u = await prisma.user.create({
        data: {
          email: d.email,
          passwordHash,
          displayName: d.name,
          locale: d.locale,
          emailVerifiedAt: new Date(),
          phoneE164: d.phone,
          phoneVerifiedAt: new Date(),
          createdAt: new Date(Date.now() - 60 * 86_400_000),
          roles: { create: { role: "USER" } },
          kyc: { create: {} },
          stats: { create: {} },
        },
      });
      const auth: AuthUser = { id: u.id, sessionId: "seed", roles: ["USER"], permissions: permissionsFor(["USER"]), mfaVerified: false, via: "bearer" };
      await kyc.start(u.id, {
        legalFirstName: d.first,
        legalLastName: d.last,
        nationalId: d.id,
        dateOfBirth: "1990-05-14",
        city: "Haifa",
        street: "Herzl",
        houseNumber: "10",
        postalCode: "3303110",
        occupation: "Engineer",
        expectedMonthlyVolumeIls: "10K_50K",
        sourceOfFunds: "SALARY",
        isPep: false,
      }, ctx);
      await kyc.sandboxComplete(u.id, "APPROVE");
      const bank = await users.addBankAccount(u.id, { bankCode: d.bank, branchNumber: d.branch, accountNumber: d.acct, holderName: `${d.first} ${d.last}` }, ctx);
      await wallet.sandboxDeposit(auth, "TRON_TRC20", "5000", ctx);
      await offers.create(auth, { side: "SELL", amountUsdt: "2000", priceIls: d.name === "Rania" ? "3.7150" : d.name === "Yossi" ? "3.7240" : "3.7300", minOrderIls: "200", maxOrderIls: "7000", paymentMethod: "IL_BANK_TRANSFER", bankAccountId: bank.id, expiresInHours: 720, terms: undefined }, ctx);
      await offers.create(auth, { side: "BUY", amountUsdt: "1500", priceIls: d.name === "Rania" ? "3.6900" : d.name === "Yossi" ? "3.6850" : "3.6800", minOrderIls: "300", maxOrderIls: "5000", paymentMethod: "IL_BANK_TRANSFER", expiresInHours: 720, terms: undefined }, ctx);
    }
    console.log(`Seeded sandbox. Staff + demo password: ${DEMO_PASSWORD}`);
  }
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
