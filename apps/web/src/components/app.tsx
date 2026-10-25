"use client";
import { Check, ChevronLeft, ChevronRight, Circle, ShieldCheck, Timer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { Avatar, Badge, Card, cn, Skeleton } from "@wasitx/ui";
import { countdown, isRtl, type MeDto, type TradeStatus, type TraderSummary } from "@wasitx/shared";
import { Link, useRouter } from "@/i18n/navigation";
import { useMe, useNow } from "@/lib/hooks";

export function PageHeader({ title, subtitle, action, back }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; back?: string }) {
  const locale = useLocale();
  const Back = isRtl(locale) ? ChevronRight : ChevronLeft;
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && (
          <Link href={back} className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
            <Back className="size-4" />
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Container({ children, className, narrow }: { children: ReactNode; className?: string; narrow?: boolean }) {
  return <div className={cn("mx-auto px-4 py-8 sm:px-6 sm:py-10", narrow ? "max-w-xl" : "max-w-7xl", className)}>{children}</div>;
}

const STATUS_TONE: Record<TradeStatus, "neutral" | "success" | "warning" | "danger" | "info" | "accent"> = {
  OFFER_ACCEPTED: "info",
  COMPLIANCE_REVIEW: "warning",
  ESCROW_PENDING: "info",
  ESCROW_CONFIRMED: "accent",
  AWAITING_FIAT_PAYMENT: "warning",
  BUYER_MARKED_PAID: "info",
  SELLER_CONFIRMED_RECEIPT: "accent",
  RELEASE_PENDING: "accent",
  COMPLETED: "success",
  EXPIRED: "neutral",
  CANCELLED: "neutral",
  DISPUTED: "danger",
  FROZEN: "danger",
};

export function TradeStatusBadge({ status }: { status: TradeStatus }) {
  const t = useTranslations("status");
  const live = !["COMPLETED", "EXPIRED", "CANCELLED"].includes(status);
  return (
    <Badge tone={STATUS_TONE[status]} dot={live}>
      {t(status)}
    </Badge>
  );
}

export function TraderCell({ trader, compact }: { trader: TraderSummary; compact?: boolean }) {
  const t = useTranslations();
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={trader.displayName} size={compact ? 32 : 38} verified={trader.verified} />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-fg">
          {trader.displayName}
          {trader.verified && <ShieldCheck className="size-3.5 shrink-0 text-accent" aria-label={t("common.verified")} />}
        </p>
        <p className="truncate text-xs text-muted">
          {t("common.trades", { count: trader.completedTrades })}
          {trader.completionRate && <> · {t("market.completion", { rate: trader.completionRate })}</>}
          {!compact && trader.avgReleaseMinutes !== null && <> · {t("market.release", { minutes: trader.avgReleaseMinutes })}</>}
        </p>
      </div>
    </div>
  );
}

export function Countdown({ deadline, className }: { deadline: string; className?: string }) {
  const now = useNow(1000);
  const left = new Date(deadline).getTime() - now.getTime();
  return (
    <span className={cn("num inline-flex items-center gap-1.5 font-mono text-lg font-bold", left < 5 * 60_000 ? "text-danger" : "text-warning", className)}>
      <Timer className="size-4" aria-hidden />
      {countdown(deadline, now)}
    </span>
  );
}

/** Client-side gate for signed-in pages; the API enforces access regardless. */
export function RequireAuth({ children }: { children: (me: MeDto) => ReactNode }) {
  const { data: me, isLoading } = useMe();
  const router = useRouter();
  useEffect(() => {
    if (!isLoading && me === null) router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
  }, [isLoading, me, router]);
  if (isLoading || !me) {
    return (
      <Container>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-6 h-40 w-full" />
      </Container>
    );
  }
  return <>{children(me)}</>;
}

export function OnboardingChecklist({ me, hasBank }: { me: MeDto; hasBank: boolean }) {
  const t = useTranslations("onboarding");
  const steps = [
    { done: me.emailVerified, label: t("email"), href: "/verify-email" },
    { done: me.phoneVerified, label: t("phone"), href: "/verify-phone" },
    { done: me.kycStatus === "APPROVED", label: t("kyc"), href: "/kyc" },
    { done: hasBank, label: t("bank"), href: "/bank-accounts" },
  ];
  if (steps.every((s) => s.done)) return null;
  const next = steps.find((s) => !s.done)!;
  return (
    <Card className="overflow-hidden">
      <div className="wx-glow p-5">
        <p className="text-sm font-semibold text-fg">{t("title")}</p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-4">
          {steps.map((s, i) => (
            <li key={i}>
              <Link href={s.href} className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors", s.done ? "border-accent/30 bg-accent/10 text-fg" : s === next ? "border-accent bg-surface text-fg" : "border-border bg-surface text-muted")}>
                {s.done ? <Check className="size-4 text-accent" /> : <Circle className="size-4" />}
                <span className="font-medium">{s.label}</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-base font-semibold text-fg">{children}</h2>
      {action}
    </div>
  );
}

export function Num({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("num", className)}>{children}</span>;
}
