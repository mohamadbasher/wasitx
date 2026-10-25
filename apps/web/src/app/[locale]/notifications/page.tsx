"use client";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, Card, CardHeader, Checkbox, EmptyState, Skeleton, cn } from "@wasitx/ui";
import type { NotificationDto, Paginated } from "@wasitx/shared";
import { Container, PageHeader, RequireAuth } from "@/components/app";
import { Link } from "@/i18n/navigation";
import { get, post, put } from "@/lib/api";
import { useFmt, useRealtime } from "@/lib/hooks";

type Prefs = { email: boolean; push: boolean; sms: boolean; marketing: boolean };

export default function NotificationsPage() {
  const t = useTranslations("notifications");
  const c = useTranslations("common");
  const f = useFmt();
  const qc = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: ["notifications", "list"],
    initialPageParam: "",
    queryFn: ({ pageParam }) => get<Paginated<NotificationDto> & { unread: number }>(`/notifications${pageParam ? `?cursor=${pageParam}` : ""}`),
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const prefs = useQuery({ queryKey: ["notif-prefs"], queryFn: () => get<Prefs>("/notifications/preferences") });
  useRealtime({ "notification.created": () => qc.invalidateQueries({ queryKey: ["notifications"] }) }, [qc]);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  const markAll = async () => {
    await post("/notifications/read", {});
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };
  const setPref = async (k: keyof Prefs, v: boolean) => {
    if (!prefs.data) return;
    await put("/notifications/preferences", { ...prefs.data, [k]: v });
    qc.invalidateQueries({ queryKey: ["notif-prefs"] });
  };

  return (
    <RequireAuth>
      {() => (
        <Container className="max-w-4xl">
          <PageHeader title={t("title")} action={<Button variant="outline" size="sm" onClick={markAll}>{t("markAll")}</Button>} />
          <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
            <Card className="overflow-hidden">
              {list.isLoading ? (
                <Skeleton className="m-4 h-40" />
              ) : !items.length ? (
                <EmptyState icon={<BellOff className="size-5" />} title={t("empty")} />
              ) : (
                <ul className="divide-y divide-border">
                  {items.map((n) => {
                    const body = (
                      <div className={cn("flex gap-3 px-5 py-4", !n.readAt && "bg-accent/5")}>
                        <span className={cn("mt-2 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-accent")} aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-fg">{n.title}</p>
                          <p className="mt-0.5 text-sm text-muted">{n.body}</p>
                          <p className="num mt-1 text-xs text-subtle">{f.dateTime(n.createdAt)}</p>
                        </div>
                      </div>
                    );
                    return <li key={n.id}>{n.link ? <Link href={n.link} className="block hover:bg-surface-2">{body}</Link> : body}</li>;
                  })}
                </ul>
              )}
              {list.hasNextPage && <Button variant="ghost" block onClick={() => list.fetchNextPage()}>{c("loadMore")}</Button>}
            </Card>
            <Card className="h-fit">
              <CardHeader title={t("preferences")} />
              <div className="space-y-3 p-5">
                {prefs.data && (["email", "push", "sms", "marketing"] as const).map((k) => (
                  <Checkbox key={k} label={t(k)} checked={prefs.data![k]} onChange={(e) => setPref(k, e.target.checked)} />
                ))}
                <p className="pt-2 text-xs text-subtle">{t("securityAlways")}</p>
              </div>
            </Card>
          </div>
        </Container>
      )}
    </RequireAuth>
  );
}
