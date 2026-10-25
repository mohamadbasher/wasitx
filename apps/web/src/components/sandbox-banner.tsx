"use client";
import { FlaskConical } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePublicConfig } from "@/lib/hooks";

export function SandboxBanner() {
  const t = useTranslations("common");
  const { data } = usePublicConfig();
  if (data && data.tradingMode !== "SANDBOX") return null;
  return (
    <div className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-xs font-medium text-warning">
      <FlaskConical className="me-1.5 inline size-3.5 align-[-2px]" aria-hidden />
      {t("sandboxBanner")}
    </div>
  );
}
