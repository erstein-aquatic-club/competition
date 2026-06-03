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
