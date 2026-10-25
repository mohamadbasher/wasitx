"use client";
import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Card } from "@wasitx/ui";
import { API_URL } from "@/lib/api";
import { usePublicConfig } from "@/lib/hooks";

export function AuthShell({ title, subtitle, children, footer }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="relative">
      <div className="wx-glow absolute inset-x-0 top-0 h-80" aria-hidden />
      <div className="relative mx-auto max-w-md px-4 py-12 sm:py-16">
        <Card className="p-6 sm:p-8 animate-rise">
          <h1 className="text-2xl font-bold tracking-tight text-fg">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </Card>
        {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
        <DevInboxHint />
      </div>
    </div>
  );
}

/** In sandbox, OTPs and email links go to the API's dev inbox instead of real providers. */
export function DevInboxHint() {
  const t = useTranslations("auth");
  const { data } = usePublicConfig();
  if (data?.tradingMode !== "SANDBOX") return null;
  return (
    <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-subtle">
      <Mail className="size-3.5" /> {t("sandboxInbox")}{" "}
      <a href={`${API_URL}/dev/outbox`} target="_blank" rel="noreferrer" className="font-semibold text-accent-strong hover:underline">
        {t("openInbox")}
      </a>
    </p>
  );
}
