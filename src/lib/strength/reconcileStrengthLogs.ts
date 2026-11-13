/**
 * Compute missing strength sets by identity, never by their position in an array.
 * A partially successful parallel write can leave a hole (e.g. sets 1 and 3
 * reached Supabase while set 2 failed). count/slice would silently miss set 2.
 *
 * The current database uniqueness contract is (run_id, exercise_id, set_index).
 * Reject ambiguous duplicate keys rather than claiming a successful sync.
 */
export interface StrengthLogIdentity {
  exercise_id: number;
  set_index?: number | null;
  set_number?: number | null;
}

export interface RemoteStrengthLogIdentity {
  exercise_id: number;
  set_index: number | null;
}

export interface MissingStrengthLog<T extends StrengthLogIdentity> {
  log: T;
  setIndex: number;
}

export function getMissingStrengthLogs<T extends StrengthLogIdentity>(
  local: readonly T[],
  remote: readonly RemoteStrengthLogIdentity[],
): MissingStrengthLog<T>[] {
  const remoteKeys = new Set<string>();
  for (const row of remote) {
    if (!Number.isFinite(row.exercise_id) || !Number.isInteger(row.set_index) || Number(row.set_index) <= 0) {
      throw new Error("Séries distantes sans identifiant fiable : synchronisation à vérifier.");
    }
    remoteKeys.add(`${row.exercise_id}:${row.set_index}`);
  }

  const perExerciseIndex = new Map<number, number>();
  const localKeys = new Set<string>();
  const missing: MissingStrengthLog<T>[] = [];
  for (const log of local) {
    if (!Number.isFinite(log.exercise_id)) {
      throw new Error("Série locale sans exercice : synchronisation impossible.");
    }
    const fallback = (perExerciseIndex.get(log.exercise_id) ?? 0) + 1;
    const setIndex = log.set_index ?? log.set_number ?? fallback;
    if (!Number.isInteger(setIndex) || setIndex <= 0) {
      throw new Error("Numéro de série invalide : synchronisation impossible.");
    }
    perExerciseIndex.set(log.exercise_id, Math.max(fallback, setIndex));
    const key = `${log.exercise_id}:${setIndex}`;
    if (localKeys.has(key)) {
      throw new Error("Deux séries partagent le même identifiant (exercice et numéro). Enregistrement à vérifier.");
    }
    localKeys.add(key);
    if (!remoteKeys.has(key)) missing.push({ log, setIndex });
  }
  return missing;
}
