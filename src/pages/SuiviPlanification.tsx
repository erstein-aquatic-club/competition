import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/shared/PageHeader";
import SwimPlanningAthleteView from "@/pages/coach/SwimPlanningAthleteView";
import { MyPlanTab } from "@/components/strength/MyPlanTab";
import { CalendarRange, Waves, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SuiviPlanification() {
  const [, navigate] = useLocation();
  const userId = useAuth((s) => s.userId);
  const [activeTab, setActiveTab] = useState<"natation" | "musculation">("natation");

  // Get profile for group_id
  const { data: authUser } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data } = await (await import("@/lib/supabase")).supabase.auth.getUser();
      return data.user;
    },
  });
  const appUserId = (authUser?.app_metadata as Record<string, unknown>)?.app_user_id as
    | number
    | undefined;

  const { data: profile } = useQuery({
    queryKey: ["my-profile-group"],
    queryFn: () => api.getProfile({ userId: appUserId }),
    enabled: !!appUserId,
  });
  const groupId = profile?.group_id ?? null;

  const handleSelectSession = useCallback(() => {
    navigate("/strength");
  }, [navigate]);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24">
      <PageHeader
        title="Ma planification"
        icon={<CalendarRange className="h-3.5 w-3.5" />}
        backHref="/suivi"
        backLabel="Mon suivi"
      />

      {/* Toggle */}
      <div className="mt-3 flex rounded-xl border bg-muted/30 p-1">
        <button
          type="button"
          onClick={() => setActiveTab("natation")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all",
            activeTab === "natation"
              ? "bg-card shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Waves className="h-3.5 w-3.5" />
          Natation
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("musculation")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all",
            activeTab === "musculation"
              ? "bg-card shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Dumbbell className="h-3.5 w-3.5" />
          Musculation
        </button>
      </div>

      {/* Content */}
      <div className="mt-4">
        {activeTab === "natation" ? (
          groupId ? (
            <SwimPlanningAthleteView
              embedded
              groupId={groupId}
            />
          ) : (
            <div className="rounded-2xl border border-dashed bg-card/70 px-4 py-10 text-center">
              <Waves className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">
                Aucun plan de natation
              </p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Ton coach configurera ta planification natation.
              </p>
            </div>
          )
        ) : userId ? (
          <MyPlanTab athleteId={userId} onSelectSession={handleSelectSession} />
        ) : null}
      </div>
    </div>
  );
}
