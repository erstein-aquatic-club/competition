import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getNotificationLog } from "@/lib/api";
import type { NotificationLogEntry } from "@/lib/api/notificationLog";
import { BellRing, Clock, MessageSquare, Users, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { buildCoachHash, type CoachCommsTab } from "./coachRouteState";

const CoachMessagesScreen = lazy(() => import("./CoachMessagesScreen"));
const CoachSmsScreen = lazy(() => import("./CoachSmsScreen"));

type CoachCommsProps = {
  athletes: Array<{
    id: number | null;
    display_name: string;
    email?: string | null;
    group_id?: number | null;
    group_label?: string | null;
  }>;
  groups: Array<{ id: number; name: string }>;
  athletesLoading: boolean;
  initialTab?: CoachCommsTab;
  initialAthleteId?: number | null;
};

function NotificationLogList() {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["notification-log"],
    queryFn: () => getNotificationLog(50, 0),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border p-3 animate-pulse motion-reduce:animate-none">
            <div className="h-4 w-48 rounded bg-muted mb-2" />
            <div className="h-3 w-full rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Aucune notification envoyée.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry: NotificationLogEntry) => {
        const date = new Date(entry.created_at);
        const fmtDate = date.toLocaleDateString("fr-FR", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        const fmtTime = date.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        });

        return (
          <div key={entry.id} className="rounded-xl border bg-card p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold truncate">{entry.title}</p>
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 shrink-0"
              >
                {entry.target_type === "group" ? (
                  <><Users className="h-3 w-3 mr-0.5 inline" />Groupe</>
                ) : entry.target_type === "user" ? (
                  <><User className="h-3 w-3 mr-0.5 inline" />Individuel</>
                ) : (
                  "Tous"
                )}
              </Badge>
            </div>
            {entry.body && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {entry.body}
              </p>
            )}
            <div className="flex items-center justify-between text-[10px] text-muted-foreground/70">
              <span>{fmtDate} à {fmtTime}</span>
              <span>{entry.recipient_count} destinataire{entry.recipient_count > 1 ? "s" : ""}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function CoachComms({
  athletes,
  groups,
  athletesLoading,
  initialTab,
  initialAthleteId,
}: CoachCommsProps) {
  const [tab, setTab] = useState<CoachCommsTab>(initialTab ?? "notifications");

  useEffect(() => {
    setTab(initialTab ?? "notifications");
  }, [initialTab]);

  useEffect(() => {
    const target = buildCoachHash(
      { section: "comms", tab, athleteId: initialAthleteId ?? null },
      window.location.hash,
    );
    if (window.location.hash !== target) {
      window.history.replaceState(null, "", target);
    }
  }, [initialAthleteId, tab]);

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1.5 rounded-xl border bg-card p-1">
        <button
          type="button"
          onClick={() => setTab("notifications")}
          className={[
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            tab === "notifications"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          <BellRing className="h-4 w-4" />
          Notifs
        </button>
        <button
          type="button"
          onClick={() => setTab("sms")}
          className={[
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            tab === "sms"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          <MessageSquare className="h-4 w-4" />
          SMS
        </button>
        <button
          type="button"
          onClick={() => setTab("historique")}
          className={[
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            tab === "historique"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          <Clock className="h-4 w-4" />
          Historique
        </button>
      </div>

      {/* Content */}
      <Suspense fallback={<PageSkeleton />}>
        {tab === "notifications" ? (
          <CoachMessagesScreen
            athletes={athletes}
            groups={groups}
            athletesLoading={athletesLoading}
            initialAthleteId={initialAthleteId}
          />
        ) : tab === "sms" ? (
          <CoachSmsScreen
            athletes={athletes}
            groups={groups}
            athletesLoading={athletesLoading}
            initialAthleteId={initialAthleteId}
          />
        ) : (
          <NotificationLogList />
        )}
      </Suspense>
    </div>
  );
}
