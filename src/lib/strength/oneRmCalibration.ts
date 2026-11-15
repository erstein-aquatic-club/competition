import type { Exercise } from "@/lib/api/types";

/** Un seul contrat pour le Focus, le journal de séries et la reprise offline.
 * Fail closed: un exercice absent d'un ancien cache PWA n'exige jamais de 1RM. */
export function isOneRmEligible(exercise: Exercise | null | undefined): boolean {
  return exercise?.one_rm_eligible === true &&
    exercise.exercise_type === "strength" &&
    exercise.is_bodyweight !== true &&
    exercise.intensity_metric === "weight_kg";
}

export interface CalibrationGateInput {
  setIndex: number;
  percent1rm: number | null | undefined;
  metric: string | null | undefined;
  isBodyweight: boolean;
  hasOneRm: boolean;
  oneRmEligible: boolean;
}

/**
 * Vrai uniquement quand une calibration 1RM en séance a du sens :
 * série 1, exo prescrit en %1RM, métrique poids (kg), non poids-de-corps,
 * et aucun 1RM connu. (Restaure les 4 filtres de l'ancien §297
 * computeMissing1RmExercises, évalués inline — cf. incident §368.)
 */
export function needsOneRmCalibration(i: CalibrationGateInput): boolean {
  return (
    i.oneRmEligible &&
    i.setIndex === 1 &&
    Number(i.percent1rm ?? 0) > 0 &&
    (i.metric ?? "weight_kg") === "weight_kg" &&
    !i.isBodyweight &&
    !i.hasOneRm
  );
}
