"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Avatar, Button, Card, CardHeader, EmptyState, Field, Input, KeyValue, Select, useToast } from "@wasitx/ui";
import { LOCALES, type MeDto, type TraderSummary } from "@wasitx/shared";
import { Container, PageHeader, RequireAuth, TraderCell } from "@/components/app";
import { usePathname, useRouter } from "@/i18n/navigation";
import { get, patch } from "@/lib/api";
import { useErrorText, useFmt } from "@/lib/hooks";

const LANG: Record<string, string> = { ar: "العربية", he: "עברית", en: "English" };

export default function ProfilePage() {
  return <RequireAuth>{(me) => <ProfileBody me={me} />}</RequireAuth>;
}

function ProfileBody({ me }: { me: MeDto }) {
  const t = useTranslations();
  const f = useFmt();
  const err = useErrorText();
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const favorites = useQuery({ queryKey: ["favorites"], queryFn: () => get<TraderSummary[]>("/favorites") });
  const [name, setName] = useState(me.displayName);
  const [locale, setLocale] = useState<string>(me.locale);

  return (
          <Container className="max-w-3xl">
            <PageHeader title={t("profile.title")} />
            <div className="space-y-5">
              <Card className="flex items-center gap-4 p-5">
                <Avatar name={me.displayName} size={56} verified={me.kycStatus === "APPROVED"} />
                <div>
                  <p className="text-lg font-semibold text-fg">{me.displayName}</p>
                  <p className="text-sm text-muted">{t("profile.memberSince")} {f.date(me.createdAt)}</p>
                </div>
              </Card>
              <Card>
                <CardHeader title={t("profile.title")} />
                <form
                  className="space-y-4 p-5"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await patch("/me/profile", { displayName: name, locale });
                      await qc.invalidateQueries({ queryKey: ["me"] });
                      toast("success", t("common.saved"));
                      if (locale !== me.locale) router.replace(pathname, { locale });
                    } catch (e) {
                      toast("danger", err(e));
                    }
                  }}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t("profile.displayName")}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
                    <Field label={t("profile.locale")}>
                      <Select value={locale} onChange={(e) => setLocale(e.target.value)}>
                        {LOCALES.map((l) => <option key={l} value={l}>{LANG[l]}</option>)}
                      </Select>
                    </Field>
                  </div>
                  <KeyValue items={[{ k: t("profile.email"), v: <span dir="ltr">{me.email}</span> }, { k: t("profile.phone"), v: <span className="num">{me.phoneMasked ?? "—"}</span> }]} />
                  <Button type="submit">{t("common.save")}</Button>
                </form>
              </Card>
              <Card>
                <CardHeader title={t("profile.favorites")} />
                {favorites.data?.length ? (
                  <ul className="divide-y divide-border">{favorites.data.map((tr) => <li key={tr.id} className="px-5 py-3"><TraderCell trader={tr} /></li>)}</ul>
                ) : (
                  <EmptyState icon={<Star className="size-5" />} title={t("common.noResults")} />
                )}
              </Card>
            </div>
          </Container>
  );
}
