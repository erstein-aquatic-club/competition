import { useQuery } from "@tanstack/react-query";
import { supabase, canUseSupabase, estimateOneRm } from "@/lib/api/client";
import { subMonths, format } from "date-fns";

// ── Types ───────────────────────────────────────────────────

export interface ExerciseSession {
  date: string;
  sets: { weight: number; reps: number; difficulty?: number | null }[];
  estimated1rm: number;
  totalVolume: number;
  bestSet: { weight: number; reps: number };
  avgDifficulty: number | null;
}

export interface UseExerciseHistoryResult {
  sessions: ExerciseSession[];
  current1rm: number;
  delta1rm: number;
  deltaPercent: number;
  isLoading: boolean;
}

interface UseExerciseHistoryProps {
  exerciseId: number;
  userId: number;
  months?: number;
}

// ── Fetch ───────────────────────────────────────────────────

async function fetchExerciseHistory(
  exerciseId: number,
  userId: number,
  months: number,
): Promise<ExerciseSession[]> {
  const from = format(subMonths(new Date(), months), "yyyy-MM-dd");

  if (!canUseSupabase()) return [];

  // Get all runs for this athlete in the period, then filter logs by exercise
  const { data: runs, error } = await supabase
    .from("strength_session_runs")
    .select("id, started_at, strength_set_logs(*)")
    .eq("athlete_id", userId)
    .gte("started_at", from)
    .eq("status", "completed")
    .order("started_at", { ascending: true });

  if (error) throw new Error(error.message);
  if (!runs?.length) return [];

  // Group logs by date (YYYY-MM-DD)
  const byDate = new Map<string, { weight: number; reps: number; difficulty?: number | null }[]>();

  for (const run of runs) {
    const logs = (run.strength_set_logs ?? []) as Array<{
      exercise_id: number;
      weight: number | null;
      reps: number | null;
      difficulty: number | null;
    }>;
    const matchingLogs = logs.filter((l) => l.exercise_id === exerciseId);
    if (matchingLogs.length === 0) continue;

    const date = format(new Date(run.started_at), "yyyy-MM-dd");
    const existing = byDate.get(date) ?? [];
    for (const log of matchingLogs) {
      const w = Number(log.weight ?? 0);
      const r = Number(log.reps ?? 0);
      if (w > 0 && r > 0) {
        existing.push({ weight: w, reps: r, difficulty: log.difficulty });
      }
    }
    if (existing.length > 0) byDate.set(date, existing);
  }

  // Build sessions
  const sessions: ExerciseSession[] = [];
  for (const [date, sets] of byDate) {
    let maxE1rm = 0;
    let bestWeight = 0;
    let bestReps = 0;
    let totalVolume = 0;
    let diffSum = 0;
    let diffCount = 0;

    for (const s of sets) {
      const e1rm = estimateOneRm(s.weight, s.reps) ?? 0;
      if (e1rm > maxE1rm) {
        maxE1rm = e1rm;
        bestWeight = s.weight;
        bestReps = s.reps;
      }
      totalVolume += s.weight * s.reps;
      if (s.difficulty != null) {
        diffSum += s.difficulty;
        diffCount++;
      }
    }

    sessions.push({
      date,
      sets,
      estimated1rm: maxE1rm,
      totalVolume,
      bestSet: { weight: bestWeight, reps: bestReps },
      avgDifficulty: diffCount > 0 ? Math.round((diffSum / diffCount) * 10) / 10 : null,
    });
  }

  return sessions.sort((a, b) => a.date.localeCompare(b.date));
}

// ── Hook ────────────────────────────────────────────────────

export function useExerciseHistory({
  exerciseId,
  userId,
  months = 3,
}: UseExerciseHistoryProps): UseExerciseHistoryResult {
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["exercise-history", exerciseId, userId, months],
    queryFn: () => fetchExerciseHistory(exerciseId, userId, months),
    enabled: !!exerciseId && !!userId,
    staleTime: 60_000,
  });

  const current1rm = sessions.length > 0 ? sessions[sessions.length - 1].estimated1rm : 0;
  const first1rm = sessions.length > 0 ? sessions[0].estimated1rm : 0;
  const delta1rm = current1rm - first1rm;
  const deltaPercent = first1rm > 0 ? (delta1rm / first1rm) * 100 : 0;

  return { sessions, current1rm, delta1rm, deltaPercent, isLoading };
}
