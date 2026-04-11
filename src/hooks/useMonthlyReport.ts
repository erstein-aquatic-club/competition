/**
 * useMonthlyReport — aggregates all data sources for a given month
 * to produce a comprehensive monthly report for an athlete.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { canUseSupabase } from "@/lib/api/client";
import { computeReadinessScore } from "@/lib/api/wellness";
import { useSwimAnalytics } from "./useSwimAnalytics";
import type { WellnessCheck, Achievement } from "@/lib/api/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseMonthlyReportProps {
  userId: number;
  month: string; // YYYY-MM
}

export interface MonthlyReportData {
  // Attendance
  sessionsCount: number;
  attendanceDelta: number; // vs previous month

  // Swimming
  swimTotalMeters: number;
  swimByStroke: Record<string, number>;
  swimByType: Record<string, number>;

  // Strength
  strengthSessionCount: number;
  prsThisMonth: number;
  totalTonnage: number;
  topExercise: string | null;

  // Wellness
  avgReadiness: number | null;
  readinessTrend: number[]; // daily scores for the month
  daysInRedZone: number;

  // Training load
  avgAcwr: number | null;
  daysInOptimalZone: number;

  // Objectives
  objectivesTotal: number;
  objectivesAchieved: number;

  // Badges
  badgesUnlockedThisMonth: string[];

  // Swimmer info
  swimmerName: string | null;

  isLoading: boolean;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function getMonthRange(month: string): { start: string; end: string } {
  const [year, m] = month.split("-").map(Number);
  const start = `${year}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(year, m, 0).getDate();
  const end = `${year}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

function getPreviousMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const prevDate = new Date(year, m - 2, 1);
  return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
}

function weeksInMonth(month: string): number {
  const { start, end } = getMonthRange(month);
  const s = new Date(start + "T12:00:00");
  const e = new Date(end + "T12:00:00");
  return Math.ceil((e.getTime() - s.getTime()) / (7 * 86_400_000)) || 4;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMonthlyReport({ userId, month }: UseMonthlyReportProps): MonthlyReportData {
  const { start, end } = useMemo(() => getMonthRange(month), [month]);
  const prevMonth = useMemo(() => getPreviousMonth(month), [month]);
  const { start: prevStart, end: prevEnd } = useMemo(() => getMonthRange(prevMonth), [prevMonth]);
  const weeks = useMemo(() => weeksInMonth(month), [month]);
  const staleTime = 5 * 60_000;

  // 1. Swim sessions (dim_sessions) for attendance
  const sessionsQuery = useQuery({
    queryKey: ["monthly-report-sessions", userId, month],
    queryFn: async () => {
      if (!canUseSupabase()) return [];
      const { data, error } = await supabase
        .from("dim_sessions")
        .select("id, session_date, rpe, session_duration_minutes, duration, distance")
        .eq("athlete_id", userId)
        .gte("session_date", start)
        .lte("session_date", end);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime,
  });

  // Previous month sessions for delta
  const prevSessionsQuery = useQuery({
    queryKey: ["monthly-report-sessions-prev", userId, prevMonth],
    queryFn: async () => {
      if (!canUseSupabase()) return [];
      const { data, error } = await supabase
        .from("dim_sessions")
        .select("id")
        .eq("athlete_id", userId)
        .gte("session_date", prevStart)
        .lte("session_date", prevEnd);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime,
  });

  // 2. Wellness checks
  const wellnessQuery = useQuery({
    queryKey: ["monthly-report-wellness", userId, month],
    queryFn: async () => {
      if (!canUseSupabase()) return [];
      const { data, error } = await supabase
        .from("wellness_checks")
        .select("*")
        .eq("user_id", userId)
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as WellnessCheck[];
    },
    staleTime,
  });

  // 3. Strength runs + set logs
  const strengthQuery = useQuery({
    queryKey: ["monthly-report-strength", userId, month],
    queryFn: async () => {
      if (!canUseSupabase()) return [];
      const { data, error } = await supabase
        .from("strength_session_runs")
        .select("id, started_at, completed_at, fatigue, strength_set_logs(rpe, weight, reps, exercise_id)")
        .eq("athlete_id", userId)
        .gte("started_at", start + "T00:00:00")
        .lte("started_at", end + "T23:59:59");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime,
  });

  // 4. Exercise names lookup
  const exerciseIdsFromStrength = useMemo(() => {
    const ids = new Set<number>();
    for (const run of strengthQuery.data ?? []) {
      const logs = Array.isArray(run.strength_set_logs) ? run.strength_set_logs : [];
      for (const log of logs) {
        if (log.exercise_id) ids.add(log.exercise_id);
      }
    }
    return Array.from(ids);
  }, [strengthQuery.data]);

  const exercisesQuery = useQuery({
    queryKey: ["monthly-report-exercises", exerciseIdsFromStrength],
    queryFn: async () => {
      if (!canUseSupabase() || exerciseIdsFromStrength.length === 0) return new Map<number, string>();
      const { data, error } = await supabase
        .from("exercises")
        .select("id, nom_exercice")
        .in("id", exerciseIdsFromStrength);
      if (error) throw new Error(error.message);
      const map = new Map<number, string>();
      for (const row of data ?? []) {
        map.set(row.id, row.nom_exercice);
      }
      return map;
    },
    staleTime,
    enabled: exerciseIdsFromStrength.length > 0,
  });

  // 5. 1RM records created this month
  const prsQuery = useQuery({
    queryKey: ["monthly-report-prs", userId, month],
    queryFn: async () => {
      if (!canUseSupabase()) return 0;
      const { count, error } = await supabase
        .from("one_rm_records")
        .select("id", { count: "exact", head: true })
        .eq("athlete_id", userId)
        .gte("recorded_at", start + "T00:00:00")
        .lte("recorded_at", end + "T23:59:59");
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    staleTime,
  });

  // 6. Achievements unlocked this month
  const achievementsQuery = useQuery({
    queryKey: ["monthly-report-achievements", userId, month],
    queryFn: async () => {
      if (!canUseSupabase()) return [];
      const { data, error } = await supabase
        .from("achievements")
        .select("key, unlocked_at")
        .eq("user_id", userId)
        .gte("unlocked_at", start + "T00:00:00")
        .lte("unlocked_at", end + "T23:59:59");
      if (error) throw new Error(error.message);
      return (data ?? []).map((a: { key: string }) => a.key);
    },
    staleTime,
  });

  // 7. Objectives
  const objectivesQuery = useQuery({
    queryKey: ["monthly-report-objectives", userId],
    queryFn: async () => {
      if (!canUseSupabase()) return { total: 0, achieved: 0 };
      // We need auth uid from users table
      const { data: userRow } = await supabase
        .from("users")
        .select("auth_uid")
        .eq("id", userId)
        .maybeSingle();
      if (!userRow?.auth_uid) return { total: 0, achieved: 0 };
      const { data, error } = await supabase
        .from("objectives")
        .select("id, target_time_seconds")
        .eq("athlete_id", userRow.auth_uid);
      if (error) throw new Error(error.message);
      const total = data?.length ?? 0;
      // We consider objectives with target_time achieved if the athlete has a matching performance
      // For simplicity, just return total count - "achieved" needs perf comparison which is complex
      return { total, achieved: 0 };
    },
    staleTime,
  });

  // 8. Swimmer name
  const nameQuery = useQuery({
    queryKey: ["monthly-report-name", userId],
    queryFn: async () => {
      if (!canUseSupabase()) return null;
      const { data } = await supabase
        .from("user_profiles")
        .select("display_name")
        .eq("user_id", userId)
        .maybeSingle();
      return data?.display_name ?? null;
    },
    staleTime: 30 * 60_000,
  });

  // 9. Swim analytics
  const swimAnalytics = useSwimAnalytics({ userId, weeks });

  // 10. Training load (ACWR) - fetch raw data for the month
  const trainingLoadQuery = useQuery({
    queryKey: ["monthly-report-training-load", userId, month],
    queryFn: async () => {
      if (!canUseSupabase()) return { avgAcwr: null, daysInOptimalZone: 0 };
      // We need 28 days before start for chronic load calculation
      const extendedStart = new Date(start + "T12:00:00");
      extendedStart.setDate(extendedStart.getDate() - 28);
      const extStartStr = extendedStart.toISOString().slice(0, 10);

      // Fetch swim sessions
      const { data: swimData } = await supabase
        .from("dim_sessions")
        .select("session_date, rpe, session_duration_minutes, duration")
        .eq("athlete_id", userId)
        .gte("session_date", extStartStr)
        .lte("session_date", end);

      // Fetch strength runs
      const { data: strengthData } = await supabase
        .from("strength_session_runs")
        .select("started_at, completed_at, fatigue, strength_set_logs(rpe, weight, reps)")
        .eq("athlete_id", userId)
        .gte("started_at", extStartStr + "T00:00:00")
        .lte("started_at", end + "T23:59:59");

      // Simplified ACWR computation for the month
      // Build daily loads
      const dailyMap = new Map<string, number>();
      for (const row of swimData ?? []) {
        const rpe = Number(row.rpe ?? 0);
        if (rpe <= 0) continue;
        const dur = Number(row.session_duration_minutes ?? row.duration ?? 90);
        const load = rpe * dur;
        const date = row.session_date;
        dailyMap.set(date, (dailyMap.get(date) ?? 0) + load);
      }
      for (const run of strengthData ?? []) {
        const ts = run.started_at ?? run.completed_at;
        if (!ts) continue;
        const date = ts.slice(0, 10);
        const logs = Array.isArray(run.strength_set_logs) ? run.strength_set_logs : [];
        const rpeVals = logs.map((l: any) => l.rpe).filter((v: any) => v != null && Number.isFinite(Number(v)));
        let load = 0;
        if (rpeVals.length > 0) {
          const avgRpe = rpeVals.reduce((s: number, v: number) => s + Number(v), 0) / rpeVals.length;
          load = (avgRpe / 10) * 45; // simplified
        }
        if (load > 0) dailyMap.set(date, (dailyMap.get(date) ?? 0) + load);
      }

      // Compute ACWR for each day in the month
      const allDates = Array.from(dailyMap.keys()).sort();
      let acwrSum = 0;
      let acwrCount = 0;
      let optimalDays = 0;

      // For each day in the month, compute 7-day acute and 28-day chronic
      const cursor = new Date(start + "T12:00:00");
      const endDate = new Date(end + "T12:00:00");
      while (cursor <= endDate) {
        const dateStr = cursor.toISOString().slice(0, 10);
        let acute = 0;
        let chronic = 0;
        for (let i = 0; i < 28; i++) {
          const d = new Date(cursor);
          d.setDate(d.getDate() - i);
          const ds = d.toISOString().slice(0, 10);
          const val = dailyMap.get(ds) ?? 0;
          if (i < 7) acute += val;
          chronic += val;
        }
        acute /= 7;
        chronic /= 28;
        if (chronic > 0) {
          const acwr = acute / chronic;
          acwrSum += acwr;
          acwrCount++;
          if (acwr >= 0.8 && acwr <= 1.3) optimalDays++;
        }
        cursor.setDate(cursor.getDate() + 1);
      }

      return {
        avgAcwr: acwrCount > 0 ? Math.round((acwrSum / acwrCount) * 100) / 100 : null,
        daysInOptimalZone: optimalDays,
      };
    },
    staleTime,
  });

  // Aggregate results
  const result = useMemo<Omit<MonthlyReportData, "isLoading">>(() => {
    const sessions = sessionsQuery.data ?? [];
    const prevSessions = prevSessionsQuery.data ?? [];
    const wellness = wellnessQuery.data ?? [];
    const strengthRuns = strengthQuery.data ?? [];
    const exerciseNames = exercisesQuery.data ?? new Map<number, string>();

    // Attendance
    const sessionsCount = sessions.length;
    const attendanceDelta = sessionsCount - prevSessions.length;

    // Swim — use actual logged distances from dim_sessions as primary source
    const loggedMeters = sessions.reduce((sum, s) => {
      const d = Number((s as any).distance ?? 0);
      return sum + (Number.isFinite(d) ? d : 0);
    }, 0);
    // Fall back to catalog-based total only if no logged distances exist
    const swimTotalMeters = loggedMeters > 0 ? loggedMeters : swimAnalytics.totalMeters;
    const swimByStroke: Record<string, number> = {};
    const swimByType: Record<string, number> = {};
    for (const week of swimAnalytics.weeklyVolumes) {
      for (const [k, v] of Object.entries(week.byStroke)) {
        swimByStroke[k] = (swimByStroke[k] ?? 0) + v;
      }
      for (const [k, v] of Object.entries(week.byType)) {
        swimByType[k] = (swimByType[k] ?? 0) + v;
      }
    }

    // Strength
    const strengthSessionCount = strengthRuns.length;
    const prsThisMonth = prsQuery.data ?? 0;
    let totalTonnage = 0;
    const exerciseTonnage = new Map<number, number>();
    for (const run of strengthRuns) {
      const logs = Array.isArray(run.strength_set_logs) ? run.strength_set_logs : [];
      for (const log of logs) {
        const w = Number(log.weight ?? 0);
        const r = Number(log.reps ?? 0);
        if (w > 0 && r > 0) {
          const vol = w * r;
          totalTonnage += vol;
          if (log.exercise_id) {
            exerciseTonnage.set(log.exercise_id, (exerciseTonnage.get(log.exercise_id) ?? 0) + vol);
          }
        }
      }
    }
    let topExercise: string | null = null;
    if (exerciseTonnage.size > 0) {
      let maxVol = 0;
      let maxId = 0;
      for (const [id, vol] of exerciseTonnage) {
        if (vol > maxVol) { maxVol = vol; maxId = id; }
      }
      topExercise = exerciseNames.get(maxId) ?? null;
    }

    // Wellness
    const readinessScores = wellness.map((w) => w.readiness_score ?? computeReadinessScore(w));
    const avgReadiness = readinessScores.length > 0
      ? Math.round(readinessScores.reduce((s, v) => s + v, 0) / readinessScores.length)
      : null;
    const readinessTrend = readinessScores;
    const daysInRedZone = readinessScores.filter((s) => s < 40).length;

    // Training load
    const tl = trainingLoadQuery.data ?? { avgAcwr: null, daysInOptimalZone: 0 };

    // Objectives
    const obj = objectivesQuery.data ?? { total: 0, achieved: 0 };

    // Badges
    const badgesUnlockedThisMonth = achievementsQuery.data ?? [];

    return {
      sessionsCount,
      attendanceDelta,
      swimTotalMeters,
      swimByStroke,
      swimByType,
      strengthSessionCount,
      prsThisMonth,
      totalTonnage: Math.round(totalTonnage),
      topExercise,
      avgReadiness,
      readinessTrend,
      daysInRedZone,
      avgAcwr: tl.avgAcwr,
      daysInOptimalZone: tl.daysInOptimalZone,
      objectivesTotal: obj.total,
      objectivesAchieved: obj.achieved,
      badgesUnlockedThisMonth,
      swimmerName: nameQuery.data ?? null,
    };
  }, [
    sessionsQuery.data, prevSessionsQuery.data, wellnessQuery.data,
    strengthQuery.data, exercisesQuery.data, prsQuery.data,
    achievementsQuery.data, objectivesQuery.data, swimAnalytics,
    trainingLoadQuery.data, nameQuery.data,
  ]);

  const isLoading =
    sessionsQuery.isLoading ||
    prevSessionsQuery.isLoading ||
    wellnessQuery.isLoading ||
    strengthQuery.isLoading ||
    prsQuery.isLoading ||
    achievementsQuery.isLoading ||
    swimAnalytics.isLoading ||
    trainingLoadQuery.isLoading;

  return { ...result, isLoading };
}
