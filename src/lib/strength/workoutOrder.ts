/**
 * Ordre d'exécution local à une séance : on ne touche jamais aux items du plan coach.
 * Les indices pointent vers l'ordre d'origine, même après une substitution.
 */
export function normalizeWorkoutOrder(saved: unknown, itemCount: number): number[] {
  const count = Math.max(0, Math.trunc(itemCount));
  const indices = Array.from({ length: count }, (_, index) => index);
  if (!Array.isArray(saved)) return indices;

  const valid = saved.filter(
    (index): index is number =>
      typeof index === "number" && Number.isInteger(index) && index >= 0 && index < count,
  );
  const unique = [...new Set(valid)];
  return [...unique, ...indices.filter((index) => !unique.includes(index))];
}

export function workoutOrderStorageKey(userId: number, runId: string | number | null | undefined): string | null {
  if (runId === null || runId === undefined || runId === "") return null;
  return `strength-exercise-order:${userId}:${runId}`;
}

export function loadWorkoutOrder(userId: number, runId: string | number | null | undefined, itemCount: number): number[] {
  const key = workoutOrderStorageKey(userId, runId);
  if (!key || typeof window === "undefined") return normalizeWorkoutOrder(null, itemCount);
  try {
    return normalizeWorkoutOrder(JSON.parse(window.localStorage.getItem(key) ?? "null"), itemCount);
  } catch {
    return normalizeWorkoutOrder(null, itemCount);
  }
}

type ReorderItem = { exercise_id: number; block?: string | null };

/**
 * Remonte l'exercice à l'index from d'une position. Seulement dans la zone
 * non commencée, sans franchir échauffement / bloc principal, et sans toucher
 * à un exercice qui a des séries enregistrées ou des champs en cours de saisie.
 */
export function canMoveWorkoutItemUp(
  items: ReorderItem[],
  from: number,
  activeIndex: number,
  loggedExerciseIds: ReadonlySet<number>,
  activeHasDraft: boolean,
): boolean {
  if (from <= activeIndex || from <= 0 || from >= items.length) return false;
  const current = items[from - 1];
  const moving = items[from];
  if ((current.block ?? "main") !== (moving.block ?? "main")) return false;
  if (loggedExerciseIds.has(current.exercise_id) || loggedExerciseIds.has(moving.exercise_id)) return false;
  if (from - 1 === activeIndex && activeHasDraft) return false;
  return true;
}

export function moveWorkoutItemUp(order: number[], from: number): number[] {
  if (from <= 0 || from >= order.length) return order;
  const next = [...order];
  [next[from - 1], next[from]] = [next[from], next[from - 1]];
  return next;
}

/** À appeler uniquement après la clôture confirmée (ou mise en file offline). */
export function clearWorkoutOrder(userId: number, runId: string | number | null | undefined): void {
  const key = workoutOrderStorageKey(userId, runId);
  if (!key || typeof window === "undefined") return;
  try { window.localStorage.removeItem(key); } catch { /* Stockage indisponible */ }
}
