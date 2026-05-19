/**
 * Calculs de puissance du saut vertical — KPI « détente verticale » du Bilan Muscu.
 *
 * Chaîne de mesure : temps de vol chronométré → hauteur du centre de masse →
 * puissance de pic (équation de Sayers) → puissance relative (W/kg, grandeur
 * effectivement scorée par le barème).
 *
 * Sources et décisions : `docs/plans/bilan-muscu-barème-puissance-detente.md`.
 */

/** Accélération de la pesanteur, m/s². */
const G = 9.81;

/**
 * Hauteur du saut (cm) à partir du temps de vol (s).
 *
 * Pendant le vol, le corps monte pendant `t/2` puis redescend pendant `t/2` ;
 * la hauteur du centre de masse vaut `h = g·t²/8`.
 *
 * Lève une `Error` si le temps de vol est nul ou négatif.
 */
export function flightTimeToHeight(flightTimeSec: number): number {
  if (flightTimeSec <= 0) {
    throw new Error('flightTimeToHeight: temps de vol doit être > 0');
  }
  return ((G * flightTimeSec ** 2) / 8) * 100;
}

/**
 * Puissance de pic (W) — équation de Sayers (1999), forme *squat jump* :
 * `P = 60,7·h(cm) + 45,3·m(kg) − 2055`.
 *
 * Lève une `Error` si le poids est nul ou négatif.
 */
export function sayersPeakPower(heightCm: number, weightKg: number): number {
  if (weightKg <= 0) {
    throw new Error('sayersPeakPower: poids doit être > 0');
  }
  return 60.7 * heightCm + 45.3 * weightKg - 2055;
}

/**
 * Puissance relative (W/kg) — puissance de pic normalisée par le poids.
 *
 * C'est la grandeur scorée par le barème `vertical_jump` : la puissance
 * absolue est confondue par la masse corporelle (un nageur lourd marquerait
 * plus haut à saut égal), la puissance relative est équitable entre corpulences.
 *
 * Lève une `Error` si le poids est nul ou négatif.
 */
export function relativePower(peakPowerW: number, weightKg: number): number {
  if (weightKg <= 0) {
    throw new Error('relativePower: poids doit être > 0');
  }
  return peakPowerW / weightKg;
}

/** Résultat consolidé d'une mesure de détente verticale. */
export interface VerticalJumpResult {
  /** Puissance relative du meilleur saut (W/kg) — la valeur effectivement scorée. */
  value: number;
  /** Poids saisi (kg). */
  weightKg: number;
  /** Temps de vol des essais saisis (s). */
  flightTimes: number[];
  /** Hauteur du meilleur saut (cm). */
  heightCm: number;
  /** Puissance de pic du meilleur saut (W). */
  peakPowerW: number;
}

/** Arrondi à 1 décimale. */
const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Consolide une mesure de détente verticale : poids + temps de vol des
 * essais → puissance relative du meilleur saut.
 *
 * Le meilleur saut est celui au temps de vol le plus long (hauteur, puis
 * puissance, croissent de façon monotone avec le temps de vol).
 *
 * Lève une `Error` si le poids est ≤ 0 ou si aucun temps de vol n'est fourni.
 */
export function verticalJumpResult(
  weightKg: number,
  flightTimes: number[],
): VerticalJumpResult {
  if (weightKg <= 0) {
    throw new Error('verticalJumpResult: poids doit être > 0');
  }
  if (flightTimes.length === 0) {
    throw new Error('verticalJumpResult: au moins un temps de vol requis');
  }
  const bestFlightTime = Math.max(...flightTimes);
  const heightCm = flightTimeToHeight(bestFlightTime);
  const peakPowerW = sayersPeakPower(heightCm, weightKg);
  return {
    value: round1(relativePower(peakPowerW, weightKg)),
    weightKg,
    flightTimes,
    heightCm: round1(heightCm),
    peakPowerW: Math.round(peakPowerW),
  };
}
