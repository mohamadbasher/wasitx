import { use } from "react";
import { redirect } from "@/i18n/navigation";

export default function Buy({ params }: { params: Promise<{ locale: string }> }) {
  redirect({ href: "/market?side=SELL", locale: use(params).locale });
}
