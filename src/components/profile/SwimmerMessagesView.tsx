import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Notification } from "@/lib/api";
import { resolveNotificationActionLabel, resolveNotificationHref } from "@/lib/notificationRouting";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { BellRing, ChevronRight, Dot, Inbox, ArrowLeft, Trash2 } from "lucide-react";

type Props = {
  userId: number;
  onBack: () => void;
  onOpenProfileSection: (section: "home" | "messages") => void;
};

const getDismissedStorageKey = (userId: number) => `profile-notifications-dismissed:${userId}`;

function formatNotificationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SwimmerMessagesView({
  userId,
  onBack,
  onOpenProfileSection,
}: Props) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);
  const [dismissedTargetIds, setDismissedTargetIds] = useState<number[]>(() => {
    if (typeof window === "undefined" || userId <= 0) return [];
    try {
      const raw = window.localStorage.getItem(getDismissedStorageKey(userId));
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed.map((value) => Number(value)).filter((value) => Number.isFinite(value))
        : [];
    } catch {
      return [];
    }
  });

  const { data, isLoading } = useQuery({
    queryKey: ["profile-notifications", userId],
    queryFn: () =>
      api.notifications_list({
        targetUserId: userId,
        limit: 100,
      }),
    enabled: userId > 0,
  });

  const notifications = useMemo(
    () =>
      (data?.notifications ?? []).filter(
        (notification) =>
          notification.target_id == null || !dismissedTargetIds.includes(notification.target_id),
      ),
    [data?.notifications, dismissedTargetIds],
  );

  useEffect(() => {
    if (typeof window === "undefined" || userId <= 0) return;
    window.localStorage.setItem(getDismissedStorageKey(userId), JSON.stringify(dismissedTargetIds));
  }, [dismissedTargetIds, userId]);

  useEffect(() => {
    if (!notifications.length) {
      setSelectedTargetId(null);
      return;
    }
    setSelectedTargetId((current) =>
      current && notifications.some((notification) => notification.target_id === current)
        ? current
        : notifications.find((notification) => !notification.read)?.target_id ?? notifications[0].target_id ?? null,
    );
  }, [notifications]);

  const selectedNotification = useMemo(
    () =>
      notifications.find((notification) => notification.target_id === selectedTargetId) ?? notifications[0] ?? null,
    [notifications, selectedTargetId],
  );

  const selectNotification = async (notification: Notification) => {
    setSelectedTargetId(notification.target_id ?? null);

    if (notification.target_id && !notification.read) {
      api.notifications_mark_read({ targetId: notification.target_id })
        .then(() => queryClient.invalidateQueries({ queryKey: ["profile-notifications"] }))
        .catch(() => {
          // Navigation should not be blocked if mark-read fails.
        });
    }
  };

  const openNotificationDestination = (notification: Notification) => {
    const href = resolveNotificationHref(notification);

    if (href === "/profile?section=messages") return;

    // Use window.location.assign to force a full hash navigation,
    // bypassing Profile's hash sync effect which can overwrite the hash.
    const base = window.location.pathname + window.location.search;
    window.location.assign(`${base}#${href}`);
  };

  const handleNotificationPress = (notification: Notification) => {
    void selectNotification(notification);

    const href = resolveNotificationHref(notification);
    if (href === "/profile?section=messages") return;

    openNotificationDestination(notification);
  };

  const handleClearAll = () => {
    const targetIds = notifications
      .map((notification) => notification.target_id)
      .filter((targetId): targetId is number => targetId != null);

    if (targetIds.length === 0) return;

    setDismissedTargetIds((current) => Array.from(new Set([...current, ...targetIds])));
    setSelectedTargetId(null);
    toast({
      title: "Notifications masquées",
      description: "La boîte de réception a été vidée sur cet appareil uniquement.",
    });
  };

  return (
    <div className="space-y-5 pb-24">
      <div className="space-y-1">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Retour
        </Button>
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
            <BellRing className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-display font-semibold uppercase italic text-primary">
              Messages
            </h2>
            <p className="text-sm text-muted-foreground">
              Détails des notifications reçues et accès rapide aux actions liées.
            </p>
          </div>
        </div>
        {notifications.length > 0 ? (
          <Button variant="ghost" size="sm" className="-ml-1 w-fit" onClick={handleClearAll}>
            <Trash2 className="h-4 w-4" />
            Masquer toutes les notifications sur cet appareil
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-24 rounded-2xl border bg-card/60 animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
      ) : null}

      {!isLoading && notifications.length === 0 ? (
        <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-card via-card to-primary/5">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-primary/30 bg-primary/5">
              <Inbox className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold">Aucun message pour le moment</p>
              <p className="text-sm text-muted-foreground">
                Les notifications du coach et les rappels automatiques apparaîtront ici.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {selectedNotification ? (
        <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 shadow-sm">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={selectedNotification.read ? "outline" : "default"}>
                {selectedNotification.read ? "Lu" : "Nouveau"}
              </Badge>
              <Badge variant="secondary">{selectedNotification.type || "message"}</Badge>
              <span className="text-xs text-muted-foreground">
                {formatNotificationDate(selectedNotification.date)}
              </span>
            </div>
            <div>
              <CardTitle className="text-lg">{selectedNotification.title}</CardTitle>
              <CardDescription className="mt-2 text-sm leading-relaxed text-foreground/80">
                {selectedNotification.message || "Aucun détail supplémentaire."}
              </CardDescription>
            </div>
          </CardHeader>
          {resolveNotificationActionLabel(selectedNotification) ? (
            <CardContent className="pt-0">
              <Button
                variant="outline"
                className="w-full justify-between"
                onClick={async () => {
                  void selectNotification(selectedNotification);
                  openNotificationDestination(selectedNotification);
                }}
              >
                {resolveNotificationActionLabel(selectedNotification)}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      {notifications.length > 0 ? (
        <div className="space-y-3">
          {notifications.map((notification) => {
            const isSelected = notification.target_id === selectedNotification?.target_id;
            const actionLabel = resolveNotificationActionLabel(notification);
            return (
              <button
                key={notification.target_id ?? notification.id}
                type="button"
                onClick={() => handleNotificationPress(notification)}
                className={`w-full rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isSelected
                    ? "border-primary/35 bg-primary/5 shadow-sm"
                    : "border-border bg-card hover:border-primary/20 hover:bg-muted/40"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="pt-0.5">
                    {notification.read ? (
                      <Dot className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <div className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_0_4px_rgba(227,6,19,0.08)]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-semibold">{notification.title}</p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatNotificationDate(notification.date)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {notification.message || "Aucun détail supplémentaire."}
                    </p>
                    {actionLabel ? (
                      <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-primary">
                        {actionLabel}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
