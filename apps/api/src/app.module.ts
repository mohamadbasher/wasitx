import { Global, MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AuthGuard } from "./common/auth/auth.guard.js";
import { EligibilityService } from "./common/auth/eligibility.service.js";
import { SessionResolver } from "./common/auth/session-resolver.service.js";
import { CryptoService } from "./common/crypto.service.js";
import { GlobalExceptionFilter } from "./common/errors.js";
import { IdempotencyInterceptor } from "./common/idempotency.interceptor.js";
import { PrismaService } from "./common/prisma.service.js";
import { RateLimitGuard, RateLimitService } from "./common/rate-limit.js";
import { RequestContextMiddleware } from "./common/request-context.middleware.js";
import { AdminController } from "./modules/admin/admin.controller.js";
import { AdminService } from "./modules/admin/admin.service.js";
import { ApprovalsService } from "./modules/approvals/approvals.service.js";
import { AuditService } from "./modules/audit/audit.service.js";
import { AuthController } from "./modules/auth/auth.controller.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { SystemConfigService } from "./modules/config/system-config.service.js";
import { DisputesService } from "./modules/disputes/disputes.service.js";
import { IntegrationsModule } from "./modules/integrations/integrations.module.js";
import { JobsService } from "./modules/jobs/jobs.service.js";
import { ReconciliationService } from "./modules/jobs/reconciliation.service.js";
import { KycService } from "./modules/kyc/kyc.service.js";
import { LedgerService } from "./modules/ledger/ledger.service.js";
import { MarketController } from "./modules/market/market.controller.js";
import { FilesService } from "./modules/messaging/files.service.js";
import { MessagesService } from "./modules/messaging/messages.service.js";
import { NotificationsService } from "./modules/notifications/notifications.service.js";
import { OffersService } from "./modules/offers/offers.service.js";
import { OutboxService } from "./modules/outbox/outbox.service.js";
import { RealtimeGateway } from "./modules/realtime/realtime.gateway.js";
import { SupportService } from "./modules/support/support.service.js";
import { SystemController } from "./modules/system/system.controller.js";
import { EscrowService } from "./modules/trades/escrow.service.js";
import { TradeEngine } from "./modules/trades/trade-engine.service.js";
import { TradeRiskService } from "./modules/trades/trade-risk.service.js";
import { TradesController } from "./modules/trades/trades.controller.js";
import { TradesService } from "./modules/trades/trades.service.js";
import { AccountController } from "./modules/users/account.controller.js";
import { UsersService } from "./modules/users/users.service.js";
import { WalletService } from "./modules/wallet/wallet.service.js";

/** Cross-cutting infrastructure shared by every domain module. */
@Global()
@Module({
  providers: [PrismaService, CryptoService, AuditService, OutboxService, SystemConfigService, LedgerService, SessionResolver, EligibilityService, RateLimitService, RealtimeGateway],
  exports: [PrismaService, CryptoService, AuditService, OutboxService, SystemConfigService, LedgerService, SessionResolver, EligibilityService, RateLimitService, RealtimeGateway],
})
class CoreModule {}

/**
 * Modular monolith (ADR 0001). Domains live in src/modules/<domain>; they talk through services, and
 * side effects that cross domains go through the outbox. Splitting a domain into its own Nest module
 * or service later does not change its public service interface.
 */
@Module({
  imports: [CoreModule, IntegrationsModule],
  controllers: [AuthController, AccountController, MarketController, TradesController, AdminController, SystemController],
  providers: [
    AuthService,
    UsersService,
    KycService,
    OffersService,
    TradeEngine,
    TradeRiskService,
    EscrowService,
    TradesService,
    MessagesService,
    FilesService,
    ApprovalsService,
    DisputesService,
    WalletService,
    SupportService,
    NotificationsService,
    ReconciliationService,
    AdminService,
    JobsService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes("*");
  }
}
