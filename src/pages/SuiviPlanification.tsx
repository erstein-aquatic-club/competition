import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/shared/PageHeader";
import SwimPlanningAthleteView from "@/pages/coach/SwimPlanningAthleteView";
import { MyPlanTab } from "@/components/strength/MyPlanTab";
import type { StrengthSessionTemplate } from "@/lib/api/types";
import { CalendarRange, Waves, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SuiviPlanification() {
  const [, navigate] = useLocation();
  const user = useAuth((s) => s.user);
  const userId = useAuth((s) => s.userId);
  const [activeTab, setActiveTab] = useState<"natation" | "musculation">("natation");

  // Share the same cache key as SwimmerHome so the profile is already resolved
  // when the user lands here from the home screen.
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile", user, userId],
    queryFn: () => api.getProfile({ displayName: user, userId }),
    enabled: !!user || !!userId,
    staleTime: 5 * 60_000,
  });
  const groupId = profile?.group_id ?? null;

  const handleSelectSession = useCallback((_session: StrengthSessionTemplate) => {
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
          ) : profileLoading ? (
            <div className="space-y-2 pl-8 relative">
              <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="rounded-xl border p-3 animate-pulse motion-reduce:animate-none">
                  <div className="h-4 w-36 rounded bg-muted" />
                  <div className="h-3 w-24 mt-2 rounded bg-muted" />
                </div>
              ))}
            </div>
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
