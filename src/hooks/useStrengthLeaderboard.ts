import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "@/lib/api";
import type { Exercise } from "@/lib/api/types";

export interface LeaderboardEntry {
  userId: number;
  name: string;
  avatarUrl: string | null;
  score: number;
  weight1rm: number;
  bodyWeight: number | null;
  rank: number;
}

export interface UseStrengthLeaderboardResult {
  entries: LeaderboardEntry[];
  userRank: number | null;
  isLoading: boolean;
  popularExercises: Array<{ id: number; name: string; athleteCount: number }>;
}

export function useStrengthLeaderboard(opts: {
  exerciseId?: number | null;
  userId?: number | null;
}): UseStrengthLeaderboardResult {
  const { exerciseId, userId } = opts;

  const { data: allRecords, isLoading: loadingRecords } = useQuery({
    queryKey: ["strength-leaderboard-records"],
    queryFn: () => api.getAllOneRmRecords(),
    staleTime: 60_000,
  });

  const { data: athletes, isLoading: loadingAthletes } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => api.getAthletes(),
    staleTime: 60_000,
  });

  const { data: exercises, isLoading: loadingExercises } = useQuery({
    queryKey: ["exercises"],
    queryFn: () => api.getExercises(),
    staleTime: 60_000,
  });

  const { data: popularRaw } = useQuery({
    queryKey: ["strength-popular-exercises"],
    queryFn: () => api.getPopularExercises(10),
    staleTime: 60_000,
  });

  // Build athlete lookup
  const athleteMap = useMemo(() => {
    const m = new Map<number, { name: string; avatarUrl: string | null }>();
    (athletes ?? []).forEach((a) => {
      if (a.id != null) {
        m.set(a.id, {
          name: a.display_name,
          avatarUrl: a.avatar_url ?? null,
        });
      }
    });
    return m;
  }, [athletes]);

  // Build exercise lookup
  const exerciseMap = useMemo(() => {
    const m = new Map<number, string>();
    (exercises ?? []).forEach((e: Exercise) => {
      m.set(e.id, e.nom_exercice);
    });
    return m;
  }, [exercises]);

  // Popular exercises with names
  const popularExercises = useMemo(() => {
    return (popularRaw ?? []).map((p) => ({
      id: p.exercise_id,
      name: exerciseMap.get(p.exercise_id) ?? `Exercice #${p.exercise_id}`,
      athleteCount: p.athlete_count,
    }));
  }, [popularRaw, exerciseMap]);

  // Compute leaderboard entries
  const entries = useMemo(() => {
    if (!allRecords || !athletes) return [];

    // Filter records by exercise if selected
    const filtered = exerciseId
      ? allRecords.filter((r) => r.exercise_id === exerciseId)
      : allRecords;

    // Group by athlete: if no exercise selected, sum all 1RMs
    const athleteScores = new Map<number, number>();
    if (exerciseId) {
      // Single exercise: best 1RM per athlete
      filtered.forEach((r) => {
        const prev = athleteScores.get(r.athlete_id) ?? 0;
        if (r.one_rm > prev) athleteScores.set(r.athlete_id, r.one_rm);
      });
    } else {
      // All exercises: sum of best 1RM per exercise
      const byAthleteExercise = new Map<string, number>();
      filtered.forEach((r) => {
        const key = `${r.athlete_id}:${r.exercise_id}`;
        const prev = byAthleteExercise.get(key) ?? 0;
        if (r.one_rm > prev) byAthleteExercise.set(key, r.one_rm);
      });
      byAthleteExercise.forEach((val, key) => {
        const aid = Number(key.split(":")[0]);
        athleteScores.set(aid, (athleteScores.get(aid) ?? 0) + val);
      });
    }

    // Build entries
    const result: LeaderboardEntry[] = [];
    athleteScores.forEach((weight1rm, aid) => {
      const athlete = athleteMap.get(aid);
      if (!athlete || weight1rm <= 0) return;

      result.push({
        userId: aid,
        name: athlete.name,
        avatarUrl: athlete.avatarUrl,
        score: weight1rm, // absolute for now
        weight1rm,
        bodyWeight: null,
        rank: 0,
      });
    });

    // Sort descending by score
    result.sort((a, b) => b.score - a.score);

    // Assign ranks
    result.forEach((entry, i) => {
      entry.rank = i + 1;
    });

    return result;
  }, [allRecords, athletes, exerciseId, athleteMap]);

  const userRank = useMemo(() => {
    if (!userId) return null;
    const entry = entries.find((e) => e.userId === userId);
    return entry?.rank ?? null;
  }, [entries, userId]);

  return {
    entries,
    userRank,
    isLoading: loadingRecords || loadingAthletes || loadingExercises,
    popularExercises,
  };
}
