import type { LocalStrengthRun, SetLogEntry } from "@/lib/types";

/**
 * An athlete can report having performed an exercise without knowing the
 * exact sets/repetitions/load (for example when correcting a finished run).
 *
 * Those activities are listed in raw_payload but MUST NOT create a synthetic
 * strength_set_logs row: that would inflate sets, tonnage and progression.
 */
export interface UnquantifiedPerformedExercise {
  exerciseId: number;
  name: string;
  notes: string | null;
}

export function getUnquantifiedPerformedExercises(
  run: Pick<LocalStrengthRun, "raw_payload">,
  logs: ReadonlyArray<Pick<SetLogEntry, "exercise_id">>,
): UnquantifiedPerformedExercise[] {
  const raw = run.raw_payload?.unquantified_exercises;
  if (!Array.isArray(raw)) return [];

  const loggedIds = new Set(logs.map((log) => Number(log.exercise_id)));
  const seen = new Set<number>();
  const result: UnquantifiedPerformedExercise[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const exerciseId = Number(record.exercise_id);
    const name = record.exercise_name;
    if (
      record.performed !== true ||
      !Number.isSafeInteger(exerciseId) ||
      exerciseId <= 0 ||
      typeof name !== "string" ||
      !name.trim() ||
      loggedIds.has(exerciseId) ||
      seen.has(exerciseId)
    ) continue;

    seen.add(exerciseId);
    result.push({
      exerciseId,
      name: name.trim(),
      notes: typeof record.notes === "string" && record.notes.trim() ? record.notes.trim() : null,
    });
  }
  return result;
}
