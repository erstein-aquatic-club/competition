// Pure functions for live PR (Personal Record) detection during workouts

export type PrType = 'estimated_1rm' | 'weight_at_reps' | 'volume_set';

export interface PrDetection {
  type: PrType;
  exerciseName: string;
  newValue: number;
  previousValue: number;
  improvement: number; // percentage
}

/**
 * Epley formula: 1RM = weight * (1 + reps / 30)
 * Returns 0 for invalid inputs.
 */
export function estimateOneRM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

/**
 * Detect if a set beats the current best estimated 1RM.
 * Returns null if no PR or if there is no previous best (0).
 */
export function detectPR(
  currentSet: { weight: number; reps: number },
  currentBest1rm: number,
  exerciseName: string,
): PrDetection | null {
  if (currentBest1rm <= 0) return null;
  const newEstimated = estimateOneRM(currentSet.weight, currentSet.reps);
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
