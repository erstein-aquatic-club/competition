import type { Stroke } from "./paceCalculator";

export type PoolSize = "25m" | "50m";
export type Sex = "M" | "F";

/** Majoration 50m − 25m en secondes (source : table officielle FFN). */
const FFN_TABLE: Partial<Record<Stroke, Partial<Record<number, { F: number; M: number }>>>> = {
  NL: {
    50:   { F: 0.70, M: 0.70 },
    100:  { F: 1.20, M: 1.50 },
    200:  { F: 2.90, M: 3.60 },
    400:  { F: 6.20, M: 7.70 },
    800:  { F: 12.90, M: 15.90 },
    1500: { F: 24.50, M: 30.10 },
  },
  Dos: {
    50:  { F: 1.30, M: 1.50 },
    100: { F: 2.30, M: 3.00 },
    200: { F: 5.40, M: 6.90 },
  },
  Brasse: {
    50:  { F: 0.70, M: 1.10 },
    100: { F: 1.90, M: 2.50 },
    200: { F: 4.50, M: 5.90 },
  },
  Pap: {
    50:  { F: 0.60, M: 0.70 },
    100: { F: 1.40, M: 1.40 },
    200: { F: 3.30, M: 3.30 },
  },
  "4N": {
    200: { F: 3.40, M: 4.10 },
    400: { F: 7.50, M: 9.00 },
  },
};

/**
 * Majoration FFN en millisecondes pour une épreuve donnée.
 * - sex null → moyenne des valeurs M/F (sexe inconnu).
 * - Retourne null si l'épreuve n'est pas dans la table (ex: 100 4N).
 */
export function getPoolMajorationMs(
  stroke: Stroke,
  distanceM: number,
  sex: Sex | null,
): number | null {
  const entry = FFN_TABLE[stroke]?.[distanceM];
  if (!entry) return null;
  if (sex) return Math.round(entry[sex] * 1000);
  return Math.round(((entry.F + entry.M) / 2) * 1000);
}

/**
 * Convertit un temps cible d'un bassin à un autre.
 * - fromPool === toPool → renvoie targetTimeMs inchangé.
 * - sex null/undefined → utilise la moyenne M/F (sexe inconnu).
 * - épreuve hors table → null.
 * - 50m → 25m : temps_25m = temps_50m − majoration.
 * - 25m → 50m : temps_50m = temps_25m + majoration.
 */
export function convertTargetTime(args: {
  targetTimeMs: number;
  fromPool: PoolSize;
  toPool: PoolSize;
  stroke: Stroke;
  distanceM: number;
  sex: Sex | null | undefined;
}): number | null {
  const { targetTimeMs, fromPool, toPool, stroke, distanceM, sex } = args;
  if (fromPool === toPool) return targetTimeMs;
  const majorationMs = getPoolMajorationMs(stroke, distanceM, sex ?? null);
  if (majorationMs === null) return null;
  return toPool === "25m"
    ? targetTimeMs - majorationMs   // 50m → 25m
    : targetTimeMs + majorationMs;  // 25m → 50m
}

export const FFN_DISCLAIMER =
  "Conversion FFN — utilisable pour engagement uniquement, pas pour comparaison de performance.";
