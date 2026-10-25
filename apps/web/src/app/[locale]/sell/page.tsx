import { use } from "react";
import { redirect } from "@/i18n/navigation";

export default function Sell({ params }: { params: Promise<{ locale: string }> }) {
  redirect({ href: "/market?side=BUY", locale: use(params).locale });
}
