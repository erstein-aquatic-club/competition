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
