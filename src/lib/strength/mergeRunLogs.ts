/**
 * Ajoute des séries au journal local d'une séance en cours, de façon idempotente.
 *
 * Audit robustesse muscu (lot 4, constat 10) : le bouton « Réessayer » d'une série
 * en échec rappelait `onLogSets` avec la même série, que le parent ré-ajoutait
 * → doublon local. Or `getMissingStrengthLogs` rejette les identités en double
 * (« Deux séries partagent le même identifiant ») : un doublon faisait donc
 * échouer la réconciliation d'arrière-plan.
 *
 * Identité = `exercise_id` + numéro de série (`set_index` ?? `set_number` ??
 * `setIndex`) ; même identité → la version la plus récente remplace l'ancienne,
 * à sa place. Sans numéro : ajout simple (aucune fusion devinée).
 */
interface RunLogLike {
  exercise_id: number;
  set_index?: number | null;
  set_number?: number | null;
  setIndex?: number | null;
}

function identity(log: RunLogLike): string | null {
  const n = log.set_index ?? log.set_number ?? log.setIndex;
  return typeof n === "number" && Number.isFinite(n) ? `${log.exercise_id}:${n}` : null;
}

export function mergeRunLogs<T extends RunLogLike>(prev: readonly T[] | null | undefined, incoming: readonly T[]): T[] {
  const out = [...(prev ?? [])];
  for (const log of incoming) {
    const key = identity(log);
    const idx = key == null ? -1 : out.findIndex((existing) => identity(existing) === key);
    if (idx >= 0) out[idx] = log;
    else out.push(log);
  }
  return out;
}
