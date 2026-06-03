export type ReloadAppetite = 'little' | 'medium' | 'lot';

const INCREMENT_KG: Record<ReloadAppetite, number> = {
  little: 2.5,
  medium: 5,
  lot: 10,
};

const roundToStep = (kg: number, step = 2.5): number =>
  Math.round(kg / step) * step;

/**
 * Suggère la charge du prochain palier de calibration 1RM.
 *
 * - Si un palier précédent existe (> 0) : incrément +2,5 / +5 / +10 kg selon
 *   l'appétit de recharge ("little" / "medium" / "lot").
 * - Sinon, si une 1RM est connue (> 0) : ancre le 1er palier à ~45 % de la 1RM
 *   (arrondi au pas de 2,5 kg).
 * - Sinon : aucune suggestion (`null`).
 */
export function suggestNextLoad(opts: {
  previousLoad: number | null;
  appetite: ReloadAppetite;
  known1rm?: number | null;
}): number | null {
  const { previousLoad, appetite, known1rm } = opts;
  if (previousLoad != null && previousLoad > 0) {
    return roundToStep(previousLoad + INCREMENT_KG[appetite]);
  }
  if (known1rm != null && known1rm > 0) {
    return roundToStep(known1rm * 0.45);
  }
  return null;
}

/**
 * Retour du nageur après la série de validation (série 2 de calibration).
 */
export interface ValidationInput {
  pain: boolean;
  repsDone: number;
  repsTarget: number;
  rir: number;
  difficulty: number | null;
}

/**
 * Détecte un « retour négatif » après la série de validation :
 * douleur, reps cibles non atteintes, échec (RIR 0) ou difficulté maximale (5).
 */
export function isNegativeValidation(v: ValidationInput): boolean {
  if (v.pain) return true;
  if (v.repsTarget > 0 && v.repsDone < v.repsTarget) return true;
  if (v.rir <= 0) return true;
  if (v.difficulty != null && v.difficulty >= 5) return true;
  return false;
}

/**
 * Propose une 1RM revue à la baisse (−10 % par défaut), arrondie au pas de 2,5 kg.
 */
export function adjustOneRmDown(oneRm: number, factor = 0.9, step = 2.5): number {
  if (oneRm <= 0) return 0;
  return roundToStep(oneRm * factor, step);
}
