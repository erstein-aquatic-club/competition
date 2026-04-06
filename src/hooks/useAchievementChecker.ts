/**
 * useAchievementChecker — evaluates badge rules against real data
 * and unlocks new achievements automatically.
 *
 * Should be mounted once per session (e.g. on Profile page).
 */

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { canUseSupabase } from "@/lib/api/client";
import { getUserAchievements, unlockAchievement } from "@/lib/api/achievements";
import { getNewBadges, type BadgeContext, type BadgeDefinition } from "@/lib/achievementRules";

interface UseAchievementCheckerProps {
  userId: number;
  onBadgeUnlocked?: (badge: BadgeDefinition) => void;
}

// ── Data fetchers ────────────────────────────────────────────

async function fetchCurrentStreak(userId: number): Promise<number> {
  if (!canUseSupabase()) return 0;
  // Get session dates ordered desc — count consecutive days from today
  const { data, error } = await supabase
    .from("dim_sessions")
    .select("session_date")
    .eq("athlete_id", userId)
    .order("session_date", { ascending: false })
    .limit(100);
  if (error || !data?.length) return 0;

  const uniqueDates = [...new Set(data.map((r) => r.session_date))].sort().reverse();
  let streak = 0;
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  for (let i = 0; i < uniqueDates.length; i++) {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - i);
    const expectedStr = expected.toISOString().slice(0, 10);
    if (uniqueDates[i] === expectedStr) {
      streak++;
    } else if (i === 0) {
      // Allow starting from yesterday if nothing today yet
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);
      if (uniqueDates[0] === yesterdayStr) {
        streak = 1;
        // Shift: next iteration expects day before yesterday
        today.setDate(today.getDate() - 1);
      } else {
        break;
      }
    } else {
      break;
    }
  }
  return streak;
}

async function fetchPrCount(userId: number): Promise<number> {
  if (!canUseSupabase()) return 0;
  const { count, error } = await supabase
    .from("one_rm_records")
    .select("id", { count: "exact", head: true })
    .eq("athlete_id", userId);
  if (error) return 0;
  return count ?? 0;
}

async function fetchWellnessStreak(userId: number): Promise<number> {
  if (!canUseSupabase()) return 0;
  const { data, error } = await supabase
    .from("wellness_checks")
    .select("date")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(60);
  if (error || !data?.length) return 0;

  const uniqueDates = [...new Set(data.map((r) => r.date))].sort().reverse();
  let streak = 0;
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  for (let i = 0; i < uniqueDates.length; i++) {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - i);
    const expectedStr = expected.toISOString().slice(0, 10);
    if (uniqueDates[i] === expectedStr) {
      streak++;
    } else if (i === 0) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (uniqueDates[0] === yesterday.toISOString().slice(0, 10)) {
        streak = 1;
        today.setDate(today.getDate() - 1);
      } else {
        break;
      }
    } else {
      break;
    }
  }
  return streak;
}

async function fetchStrengthSessionCount(userId: number): Promise<number> {
  if (!canUseSupabase()) return 0;
  const { count, error } = await supabase
    .from("strength_session_runs")
    .select("id", { count: "exact", head: true })
    .eq("athlete_id", userId)
    .not("completed_at", "is", null);
  if (error) return 0;
  return count ?? 0;
}

async function fetchCompetitionCount(userId: number): Promise<number> {
  if (!canUseSupabase()) return 0;
  const { count, error } = await supabase
    .from("competition_assignments")
    .select("id", { count: "exact", head: true })
    .eq("athlete_id", userId);
  if (error) return 0;
  return count ?? 0;
}

async function fetchBadgeContext(userId: number): Promise<BadgeContext> {
  const [currentStreak, prCount, wellnessStreak, strengthSessionCount, competitionCount] =
    await Promise.all([
      fetchCurrentStreak(userId),
      fetchPrCount(userId),
      fetchWellnessStreak(userId),
      fetchStrengthSessionCount(userId),
      fetchCompetitionCount(userId),
    ]);
  return { currentStreak, prCount, wellnessStreak, strengthSessionCount, competitionCount };
}

// ── Hook ─────────────────────────────────────────────────────

export function useAchievementChecker({ userId, onBadgeUnlocked }: UseAchievementCheckerProps) {
  const queryClient = useQueryClient();
  const hasRun = useRef(false);

  const { data: achievements } = useQuery({
    queryKey: ["achievements", userId],
    queryFn: () => getUserAchievements(userId),
    enabled: !!userId,
    staleTime: 60_000,
  });

  const { data: context } = useQuery({
    queryKey: ["badge-context", userId],
    queryFn: () => fetchBadgeContext(userId),
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!achievements || !context || hasRun.current || !userId) return;
    hasRun.current = true;

    const alreadyUnlocked = achievements.map((a) => a.key);
    const newBadges = getNewBadges(context, alreadyUnlocked);

    if (newBadges.length === 0) return;

    // Unlock all new badges
    (async () => {
      for (const badge of newBadges) {
        const result = await unlockAchievement(userId, badge.key, badge.type, {
          palier: badge.palier,
        });
        if (result) {
          onBadgeUnlocked?.(badge);
        }
      }
      // Refresh achievements query so BadgesGrid updates
      queryClient.invalidateQueries({ queryKey: ["achievements", userId] });
    })();
  }, [achievements, context, userId, onBadgeUnlocked, queryClient]);
}
