/**
 * Keep strength planning in sync across an athlete's phone, other PWA windows
 * and the coach's device without reloading the application.
 *
 * Source of truth remains Supabase. Realtime only invalidates React Query:
 * a full canonical read follows, so events cannot partially mutate a plan.
 * Foreground / online / channel-reconnect refetches cover missed events when
 * iOS suspends the PWA or the websocket is disconnected.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { supabaseConfig } from "@/lib/config";
import { invalidateStrengthPlanningQueries } from "@/lib/queryClient";

export function StrengthPlanningSync() {
  const userId = useAuth((s) => s.userId);
  const role = useAuth((s) => s.role);

  const { data: profile } = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => getProfile({ userId: userId! }),
    enabled: userId != null,
    staleTime: 5 * 60_000,
  });
  const groupId = profile?.group_id ?? null;

  useEffect(() => {
    if (userId == null || !supabaseConfig.hasSupabase) return;

    let refreshTimer: number | undefined;

    const refresh = () => {
      if (navigator.onLine === false) return;
      void invalidateStrengthPlanningQueries().catch(() => {
        // Network failures must not break the PWA; the next reconnect,
        // foreground event or server event retries the canonical read.
      });
    };

    // Collapse a group of table events emitted by the same committed RPC.
    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(refresh, 100);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    const onPageShow = () => scheduleRefresh();
    const onFocus = () => scheduleRefresh();
    const onOnline = () => scheduleRefresh();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    const isCoach = role === "coach" || role === "admin";
    const channel = supabase.channel(`strength-plan-sync:${userId}:${isCoach ? "coach" : "athlete"}`);

    // Only INSERT/UPDATE are watched: filtered DELETE events have different
    // authorization semantics in Postgres Changes. Foreground revalidation
    // covers deletions and temporary network gaps.
    const watch = (table: string, filter?: string) => {
      channel
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table, ...(filter ? { filter } : {}) },
          scheduleRefresh,
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table, ...(filter ? { filter } : {}) },
          scheduleRefresh,
        );
    };

    watch("strength_mesocycles", isCoach ? undefined : `athlete_id=eq.${userId}`);
    watch("strength_planning_slot_overrides", isCoach ? undefined : `athlete_id=eq.${userId}`);
    watch("strength_planning_week_overrides", isCoach ? undefined : `athlete_id=eq.${userId}`);
    // Applications include both direct athlete and group assignments. RLS
    // determines which applications this authenticated user can receive.
    watch("training_plan_applications");
    if (isCoach || groupId != null) {
      watch("strength_planning_slots", isCoach ? undefined : `group_id=eq.${groupId}`);
    }

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // Events emitted while the PWA was suspended are not replayed.
        // Re-read after every successful websocket subscription/reconnection.
        scheduleRefresh();
      }
    });

    // Restore freshness on the first mount after persisted-cache hydration.
    scheduleRefresh();

    return () => {
      window.clearTimeout(refreshTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      void supabase.removeChannel(channel);
    };
  }, [userId, role, groupId]);

  return null;
}
