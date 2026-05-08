import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications_list, notifications_mark_read, notifications_clear_all } from "@/lib/api";
import type { Notification } from "@/lib/api";
import {
  filterVisibleNotifications,
  getDismissedUnreadTargetIds,
  persistDismissedNotificationTargetIds,
  readDismissedNotificationTargetIds,
} from "@/lib/notificationsVisibility";
import { resolveNotificationActionLabel, resolveNotificationHref } from "@/lib/notificationRouting";
import { formatRelativeDate } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ChevronRight, Inbox, ArrowLeft, Trash2, X } from "lucide-react";

type Props = {
  userId: number;
  onBack: () => void;
  onOpenProfileSection: (section: "home" | "messages") => void;
};

export default function SwimmerMessagesView({
  userId,
  onBack,
  onOpenProfileSection: _onOpenProfileSection,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const syncedDismissedUnreadIdsRef = useRef<Set<number>>(new Set());
  const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);
  const [dismissedTargetIds, setDismissedTargetIds] = useState<number[]>(() => {
    return readDismissedNotificationTargetIds(userId);
  });

  const { data, isLoading } = useQuery({
    queryKey: ["profile-notifications", userId],
    queryFn: () =>
      notifications_list({
        targetUserId: userId,
        limit: 100,
      }),
    enabled: userId > 0,
  });

  const allNotifications = data?.notifications ?? [];

  const notifications = useMemo(
    () => filterVisibleNotifications(allNotifications, dismissedTargetIds),
    [allNotifications, dismissedTargetIds],
  );

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const hiddenNotificationCount = Math.max(allNotifications.length - notifications.length, 0);

  const dismissedUnreadTargetIds = useMemo(
    () => getDismissedUnreadTargetIds(allNotifications, dismissedTargetIds),
    [allNotifications, dismissedTargetIds],
  );

  useEffect(() => {
    persistDismissedNotificationTargetIds(userId, dismissedTargetIds);
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

  useEffect(() => {
    if (dismissedUnreadTargetIds.length === 0) return;

    const unsyncedIds = dismissedUnreadTargetIds.filter(
      (targetId) => !syncedDismissedUnreadIdsRef.current.has(targetId),
    );

    if (unsyncedIds.length === 0) return;

    unsyncedIds.forEach((targetId) => syncedDismissedUnreadIdsRef.current.add(targetId));

    Promise.all(unsyncedIds.map((targetId) => notifications_mark_read({ targetId })))
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["profile-notifications"] });
        queryClient.invalidateQueries({ queryKey: ["notifications-home"] });
      })
      .catch(() => {
        unsyncedIds.forEach((targetId) => syncedDismissedUnreadIdsRef.current.delete(targetId));
      });
  }, [dismissedUnreadTargetIds, queryClient]);

  const selectedNotification = useMemo(
    () =>
      notifications.find((notification) => notification.target_id === selectedTargetId) ?? notifications[0] ?? null,
    [notifications, selectedTargetId],
  );

  const selectNotification = async (notification: Notification) => {
    setSelectedTargetId(notification.target_id ?? null);

    if (notification.target_id && !notification.read) {
      notifications_mark_read({ targetId: notification.target_id })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["profile-notifications"] });
          queryClient.invalidateQueries({ queryKey: ["notifications-home"] });
        })
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

  const handleClearAll = async () => {
    const targetIds = notifications
      .map((notification) => notification.target_id)
      .filter((targetId): targetId is number => targetId != null);

    if (targetIds.length === 0) return;

    // Optimistic dismiss locally so the UI is instant.
    setDismissedTargetIds((current) => Array.from(new Set([...current, ...targetIds])));
    setSelectedTargetId(null);

    try {
      const result = await notifications_clear_all({ userId });
      queryClient.invalidateQueries({ queryKey: ["profile-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-home"] });

      // Keep dismissed IDs in localStorage until the cache refetch completes.
      // Clearing them here would cause SwimmerHome to flash stale badges while
      // the ["notifications-home"] query is still in flight with old cache data.
      // The old target IDs are harmless once the server has deleted/dismissed
      // the underlying rows — new notifications will have different target_id values.
      syncedDismissedUnreadIdsRef.current = new Set();

      const totalCleared = result.deleted + result.dismissed;
      toast({
        title: "Messages effacés",
        description:
          totalCleared > 0
            ? `${totalCleared} notification${totalCleared > 1 ? "s" : ""} nettoyée${totalCleared > 1 ? "s" : ""}.`
            : "Aucune notification à nettoyer.",
      });
    } catch (error) {
      // Local dismiss already applied — degrade gracefully but warn the user
      // that the cleanup isn't persisted cross-device.
      toast({
        title: "Nettoyage serveur incomplet",
        description:
          "Les notifications sont masquées sur cet appareil. Réessayez plus tard pour effacer définitivement.",
        variant: "destructive",
      });
      console.error("[notifications_clear_all] failed", error);
    }
  };

  const handleDismissOne = (targetId: number) => {
    setDismissedTargetIds((current) => Array.from(new Set([...current, targetId])));
  };

  const handleRestoreHiddenNotifications = () => {
    setDismissedTargetIds([]);
    toast({
      title: "Messages réaffichés",
      description: "Les notifications masquées sur cet appareil sont de nouveau visibles.",
    });
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack} aria-label="Retour">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Messages
          </h2>
          {unreadCount > 0 ? (
            <Badge className="rounded-full px-1.5 py-0 text-[11px] leading-5 h-5">
              {unreadCount}
            </Badge>
          ) : null}
        </div>
        {notifications.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => { void handleClearAll(); }}
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Tout effacer</span>
          </Button>
        ) : null}
      </div>

      {/* Loading skeletons */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-14 rounded-xl border bg-card/60 animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
      ) : null}

      {/* Empty state */}
      {!isLoading && notifications.length === 0 ? (
        <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-card via-card to-primary/5">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-primary/30 bg-primary/5">
              <Inbox className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold">
                {hiddenNotificationCount > 0 ? "Tous les messages sont masqués ici" : "Aucun message pour le moment"}
              </p>
              <p className="text-sm text-muted-foreground">
                {hiddenNotificationCount > 0
                  ? "La home n'affichera plus ces messages comme non lus. Vous pouvez les réafficher sur cet appareil si besoin."
                  : "Les notifications du coach et les rappels automatiques apparaîtront ici."}
              </p>
            </div>
            {hiddenNotificationCount > 0 ? (
              <Button variant="outline" size="sm" onClick={handleRestoreHiddenNotifications}>
                Réafficher les messages masqués
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* List */}
      {notifications.length > 0 ? (
        <div className="space-y-1">
          {notifications.map((notification) => {
            const isExpanded = notification.target_id === selectedNotification?.target_id;
            const actionLabel = resolveNotificationActionLabel(notification);
            const isUnread = !notification.read;

            return (
              <div
                key={notification.target_id ?? notification.id}
                className={`group relative rounded-xl transition-colors ${
                  isUnread ? "bg-primary/8" : "bg-transparent"
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleNotificationPress(notification)}
                  className="w-full px-3 py-3 pr-10 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
                  aria-expanded={isExpanded}
                  aria-controls={`notif-detail-${notification.target_id ?? notification.id}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Unread dot */}
                    <div className="mt-1.5 shrink-0 w-2">
                      {isUnread ? (
                        <div className="h-2 w-2 rounded-full bg-primary shadow-[0_0_0_3px_rgba(227,6,19,0.1)]" />
                      ) : null}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-sm ${isUnread ? "font-semibold" : "font-normal text-muted-foreground"}`}>
                          {notification.title}
                        </p>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatRelativeDate(notification.date)}
                        </span>
                      </div>
                      {!isExpanded ? (
                        <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                          {notification.message || "Aucun détail supplémentaire."}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </button>

                {/* Dismiss button — absolute, outside the main button */}
                {notification.target_id != null ? (
                  <button
                    type="button"
                    onClick={() => handleDismissOne(notification.target_id!)}
                    className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                    aria-label="Masquer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}

                {/* Inline expanded content */}
                {isExpanded ? (
                  <div id={`notif-detail-${notification.target_id ?? notification.id}`} className="mx-3 mb-3 rounded-xl border border-border/60 bg-card p-3 space-y-2">
                    <p className="text-sm text-foreground/80 leading-relaxed">
                      {notification.message || "Aucun détail supplémentaire."}
                    </p>
                    {actionLabel ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-between"
                        onClick={() => handleNotificationPress(notification)}
                      >
                        {actionLabel}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
