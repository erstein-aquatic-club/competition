import { lazy, Suspense, useState } from "react";
import { BellRing, MessageSquare } from "lucide-react";
import { PageSkeleton } from "@/components/shared/PageSkeleton";

const CoachMessagesScreen = lazy(() => import("./CoachMessagesScreen"));
const CoachSmsScreen = lazy(() => import("./CoachSmsScreen"));

type CommsTab = "notifications" | "sms";

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
};

export default function CoachComms({
  athletes,
  groups,
  athletesLoading,
}: CoachCommsProps) {
  const [tab, setTab] = useState<CommsTab>("notifications");

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
          Notifications
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
      </div>

      {/* Content */}
      <Suspense fallback={<PageSkeleton />}>
        {tab === "notifications" ? (
          <CoachMessagesScreen
            athletes={athletes}
            groups={groups}
            athletesLoading={athletesLoading}
          />
        ) : (
          <CoachSmsScreen
            athletes={athletes}
            groups={groups}
            athletesLoading={athletesLoading}
          />
        )}
      </Suspense>
    </div>
  );
}
