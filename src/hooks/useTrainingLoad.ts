/**
 * useTrainingLoad — computes training load metrics (sRPE, ACWR, monotony, strain)
 * by merging swim sessions (dim_sessions) and strength runs (strength_session_runs + strength_set_logs).
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  computeSRPE,
  computeAcuteLoad,
  computeChronicLoad,
  computeACWR,
  acwrZone,
  computeMonotony,
  computeStrain,
} from "@/lib/trainingLoadHelpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseTrainingLoadProps {
  userId: number;
  days?: number; // default 28
}

export interface DailyLoad {
  date: string;
  swimLoad: number;
  strengthLoad: number;
  totalLoad: number;
}

export interface TrainingLoadData {
  dailyLoads: DailyLoad[];
  acuteLoad: number;
  chronicLoad: number;
  acwr: number | null;
  acwrZone: "optimal" | "warning" | "danger";
  monotony: number;
  strain: number;
  isLoading: boolean;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days + 1); // inclusive
  return toISODate(d);
}

// ---------------------------------------------------------------------------
// Pure aggregation (exported for testing)
// ---------------------------------------------------------------------------

interface SwimRow {
  session_date: string;
  rpe: number | null;
  session_duration_minutes: number | null;
  duration: number | null; // legacy duration field (minutes)
}

interface StrengthRun {
  started_at: string | null;
  completed_at: string | null;
  fatigue: number | null;
  strength_set_logs: StrengthSetLog[];
}

interface StrengthSetLog {
  rpe: number | null;
  weight: number | null;
  reps: number | null;
}

const DEFAULT_SWIM_DURATION = 90;
const DEFAULT_STRENGTH_DURATION = 45;
const VOLUME_NORMALIZER = 100; // divides sum(weight*reps) to get a 0-500 scale

/**
 * Compute the strength sRPE for a single run.
 * Strategy:
 *   1. If set logs have rpe values, use avg(rpe) * estimated_duration
 *   2. Otherwise, compute normalized volume = sum(weight * reps) / VOLUME_NORMALIZER
 */
function strengthRunLoad(run: StrengthRun): number {
  const logs = Array.isArray(run.strength_set_logs) ? run.strength_set_logs : [];

  // Try RPE-based load first
  const rpeValues = logs
    .map((l) => l.rpe)
    .filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));

  if (rpeValues.length > 0) {
    const avgRpe = rpeValues.reduce((s, v) => s + v, 0) / rpeValues.length;
    const duration = estimateStrengthDuration(run);
    return computeSRPE(avgRpe / 10, duration); // rpe is 1-10, normalize to ~1 scale like swim
  }

  // Fallback: volume-based approximation
  let totalVolume = 0;
  for (const log of logs) {
    const w = Number(log.weight ?? 0);
    const r = Number(log.reps ?? 0);
    if (w > 0 && r > 0) totalVolume += w * r;
  }
  return Math.round(totalVolume / VOLUME_NORMALIZER);
}

function estimateStrengthDuration(run: StrengthRun): number {
  if (run.started_at && run.completed_at) {
    const diff =
      (new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 60_000;
    if (diff > 0 && diff < 300) return Math.round(diff);
  }
  return DEFAULT_STRENGTH_DURATION;
}

/**
 * Merge swim and strength data into daily loads array.
 * Exported so tests can exercise this pure function directly.
 */
export function computeDailyLoads(
  swimRows: SwimRow[],
  strengthRuns: StrengthRun[],
  days: number,
): DailyLoad[] {
  const cutoff = daysAgo(days);
  const today = toISODate(new Date());

  // Build a map date -> { swimLoad, strengthLoad }
  const map = new Map<string, { swimLoad: number; strengthLoad: number }>();

  // Fill every day in the range
  const cursor = new Date(cutoff);
  while (toISODate(cursor) <= today) {
    map.set(toISODate(cursor), { swimLoad: 0, strengthLoad: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  // Accumulate swim loads
  for (const row of swimRows) {
    const date = row.session_date;
    if (!date || date < cutoff || date > today) continue;
    const rpe = Number(row.rpe ?? 0);
    if (rpe <= 0) continue;
    const duration = Number(row.session_duration_minutes ?? row.duration ?? DEFAULT_SWIM_DURATION);
    const srpe = computeSRPE(rpe, duration);
    const entry = map.get(date) ?? { swimLoad: 0, strengthLoad: 0 };
    entry.swimLoad += srpe;
    map.set(date, entry);
  }

  // Accumulate strength loads
  for (const run of strengthRuns) {
    const ts = run.started_at ?? run.completed_at;
    if (!ts) continue;
    const date = ts.slice(0, 10);
    if (date < cutoff || date > today) continue;
    const load = strengthRunLoad(run);
    const entry = map.get(date) ?? { swimLoad: 0, strengthLoad: 0 };
    entry.strengthLoad += load;
    map.set(date, entry);
  }

  // Sort and return
  return Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, { swimLoad, strengthLoad }]) => ({
      date,
      swimLoad,
      strengthLoad,
      totalLoad: swimLoad + strengthLoad,
    }));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTrainingLoad({ userId, days = 28 }: UseTrainingLoadProps): TrainingLoadData {
  const cutoff = daysAgo(days);

  // 1. Fetch swim sessions
  const swimQuery = useQuery({
    queryKey: ["training-load-swim", userId, days],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dim_sessions")
        .select("session_date, rpe, session_duration_minutes, duration")
        .eq("athlete_id", userId)
        .gte("session_date", cutoff)
        .order("session_date", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as SwimRow[];
    },
    staleTime: 5 * 60_000,
  });

  // 2. Fetch strength runs + set logs
  const strengthQuery = useQuery({
    queryKey: ["training-load-strength", userId, days],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("strength_session_runs")
        .select("started_at, completed_at, fatigue, strength_set_logs(rpe, weight, reps)")
        .eq("athlete_id", userId)
        .gte("started_at", cutoff + "T00:00:00")
        .order("started_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as StrengthRun[];
    },
    staleTime: 5 * 60_000,
  });

  // 3. Merge and compute
  const result = useMemo<Omit<TrainingLoadData, "isLoading">>(() => {
    const swimRows = swimQuery.data ?? [];
    const strengthRuns = strengthQuery.data ?? [];
    const dailyLoads = computeDailyLoads(swimRows, strengthRuns, days);

    const srpeValues = dailyLoads
      .filter((d) => d.totalLoad > 0)
      .map((d) => ({ date: d.date, srpe: d.totalLoad }));

    const acuteLoad = computeAcuteLoad(srpeValues);
    const chronicLoad = computeChronicLoad(srpeValues);
    const acwr = computeACWR(acuteLoad, chronicLoad);

    // Last 7 days daily loads for monotony
    const last7 = dailyLoads.slice(-7).map((d) => d.totalLoad);
    const monotony = computeMonotony(last7);
    const strain = computeStrain(acuteLoad, monotony);

    return {
      dailyLoads,
      acuteLoad,
      chronicLoad,
      acwr,
      acwrZone: acwr !== null ? acwrZone(acwr) : "warning",
      monotony,
      strain,
    };
  }, [swimQuery.data, strengthQuery.data, days]);

  return {
    ...result,
    isLoading: swimQuery.isLoading || strengthQuery.isLoading,
  };
}
