// Pure functions for live PR (Personal Record) detection during workouts

export type PrType = 'estimated_1rm' | 'weight_at_reps' | 'volume_set';

export interface PrDetection {
  type: PrType;
  exerciseName: string;
  newValue: number;
  previousValue: number;
  improvement: number; // percentage
}

// Maps difficulty (1–5) to estimated Reps In Reserve.
// 5/5 = at failure (RIR 0). Lower difficulty = more reps in reserve.
function difficultyToRIR(difficulty: number | null | undefined): number {
  if (difficulty == null) return 0;
  const map: Record<number, number> = { 1: 5, 2: 4, 3: 3, 4: 1, 5: 0 };
  return map[Math.round(difficulty)] ?? 0;
}

/**
 * Epley formula: 1RM = weight * (1 + effectiveReps / 30)
 * Adds estimated RIR to reps so the 1RM reflects true strength rather than the
 * effort of a submaximal set.
 *
 * The third parameter accepts either a difficulty number (1–5, mapped to RIR via
 * `difficultyToRIR`; 5 = at failure = RIR 0) or an explicit `{ rir }` object
 * which takes precedence over difficulty. `null`/`undefined` falls back to RIR 0.
 */
export function estimateOneRM(
  weight: number,
  reps: number,
  effort?: number | null | { rir: number },
): number {
  if (reps <= 0 || weight <= 0) return 0;
  const rir =
    effort != null && typeof effort === "object"
      ? Math.max(0, Math.round(effort.rir))
      : difficultyToRIR(effort);
  const effectiveReps = reps + rir;
  if (effectiveReps <= 0) return 0;
  if (effectiveReps === 1) return weight;
  return Math.round(weight * (1 + effectiveReps / 30) * 10) / 10;
}

/**
 * Detect if a set beats the current best estimated 1RM.
 * Accepts optional difficulty to adjust the estimate for submaximal sets.
 * Returns null if no PR or if there is no previous best (0).
 */
export function detectPR(
  currentSet: { weight: number; reps: number; difficulty?: number | null },
  currentBest1rm: number,
  exerciseName: string,
): PrDetection | null {
  if (currentBest1rm <= 0) return null;
  const newEstimated = estimateOneRM(currentSet.weight, currentSet.reps, currentSet.difficulty);
  if (newEstimated <= 0) return null;
  if (newEstimated > currentBest1rm) {
    return {
      type: 'estimated_1rm',
      exerciseName,
      newValue: newEstimated,
      previousValue: currentBest1rm,
      improvement: Math.round(((newEstimated - currentBest1rm) / currentBest1rm) * 100),
    };
  }
  return null;
}
