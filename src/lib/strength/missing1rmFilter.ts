import type { StrengthSessionItem, Exercise } from "@/lib/api";
import type { OneRmEntry } from "@/lib/types";

export interface Missing1RmExercise {
  exerciseId: number;
  exerciseName: string;
}

/**
 * §297 — Renvoie la liste des exos pour lesquels le OneRmGate doit s'ouvrir.
 * Exclut :
 *  - les items sans %1RM prescrit (percent_1rm <= 0)
 *  - les exos déjà dotés d'un 1RM > 0
 *  - les exos marqués `is_bodyweight = true` (PDC ne demande jamais de 1RM)
 *  - les exos dont `intensity_metric != weight_kg` (§298 — hauteur/distance/temps,
 *    pas de 1RM)
 */
export function computeMissing1RmExercises(
  items: StrengthSessionItem[],
  oneRMs: OneRmEntry[] | null | undefined,
  exerciseLookup: Map<number, Exercise>,
): Missing1RmExercise[] {
  const oneRMsArr = oneRMs ?? [];
  return items
    .filter((item) => (item.percent_1rm ?? 0) > 0)
    .filter((item) => {
      const ex = exerciseLookup.get(item.exercise_id);
      if (ex?.is_bodyweight) return false;
      // §298 — seules les métriques weight_kg utilisent un 1RM
      if (ex?.intensity_metric && ex.intensity_metric !== "weight_kg") return false;
      return true;
    })
    .filter(
      (item) =>
        !oneRMsArr.some(
          (rm) => rm.exercise_id === item.exercise_id && Number(rm.weight) > 0,
        ),
    )
    .map((item) => ({
      exerciseId: item.exercise_id,
      exerciseName:
        item.exercise_name
        ?? exerciseLookup.get(item.exercise_id)?.nom_exercice
        ?? `Ex #${item.exercise_id}`,
    }));
}
