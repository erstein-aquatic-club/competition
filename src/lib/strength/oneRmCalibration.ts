export interface CalibrationGateInput {
  setIndex: number;
  percent1rm: number | null | undefined;
  metric: string | null | undefined;
  isBodyweight: boolean;
  hasOneRm: boolean;
}

/**
 * Vrai uniquement quand une calibration 1RM en séance a du sens :
 * série 1, exo prescrit en %1RM, métrique poids (kg), non poids-de-corps,
 * et aucun 1RM connu. (Restaure les 4 filtres de l'ancien §297
 * computeMissing1RmExercises, évalués inline — cf. incident §368.)
 */
export function needsOneRmCalibration(i: CalibrationGateInput): boolean {
  return (
    i.setIndex === 1 &&
    Number(i.percent1rm ?? 0) > 0 &&
    (i.metric ?? "weight_kg") === "weight_kg" &&
    !i.isBodyweight &&
    !i.hasOneRm
  );
}
