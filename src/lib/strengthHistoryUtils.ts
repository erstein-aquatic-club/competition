import type { SetLogEntry } from "@/lib/types";

/** Sum of (weight × reps) for all logs */
export function computeRunTonnage(logs: SetLogEntry[]): number {
  let total = 0;
  for (const log of logs) {
    const w = Number(log.weight ?? 0);
    const r = Number(log.reps ?? 0);
    if (w > 0 && r > 0) total += w * r;
  }
  return total;
}

/** Sum of reps across all logs */
export function computeRunTotalReps(logs: SetLogEntry[]): number {
  let total = 0;
  for (const log of logs) {
    const r = Number(log.reps ?? 0);
    if (r > 0) total += r;
  }
  return total;
}

/** sRPE = RPE × duration (minutes). Returns 0 if either is missing. */
export function computeRunSRPE(
  rpe: number | null | undefined,
  duration: number | null | undefined,
): number {
  if (!rpe || !duration) return 0;
  return Math.round(rpe * duration);
}

export interface ExerciseGroup {
  exerciseId: number;
  exerciseName: string;
  sets: SetLogEntry[];
  volume: number;
  maxWeight: number;
}

/** Group logs by exercise_id, preserving first-seen order */
export function groupLogsByExercise(
  logs: SetLogEntry[],
  exerciseNames: Map<number, string>,
): ExerciseGroup[] {
  const map = new Map<number, SetLogEntry[]>();
  const order: number[] = [];

  for (const log of logs) {
    const eid = Number(log.exercise_id);
    if (!eid) continue;
    if (!map.has(eid)) {
      map.set(eid, []);
      order.push(eid);
    }
    map.get(eid)!.push(log);
  }

  return order.map((eid) => {
    const sets = map.get(eid)!;
    let volume = 0;
    let maxWeight = 0;
    for (const s of sets) {
      const w = Number(s.weight ?? 0);
      const r = Number(s.reps ?? 0);
      if (w > 0 && r > 0) volume += w * r;
      if (w > maxWeight) maxWeight = w;
    }
    return {
      exerciseId: eid,
      exerciseName: exerciseNames.get(eid) ?? `Exercice #${eid}`,
      sets,
      volume,
      maxWeight,
    };
  });
}

/** Average difficulty (1-5) across logs that have a value. Rounds to nearest int. */
export function computeAvgDifficulty(logs: SetLogEntry[]): number {
  const vals = logs
    .map((l) => l.difficulty)
    .filter((v): v is number => v != null && Number.isFinite(v));
  if (vals.length === 0) return 0;
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}
