/**
 * Indice balistique du lancer médecine-ball assis — KPI `medball_vertical_throw`
 * du Bilan Muscu (§309 — remplace l'ancien lancer vertical allongé, non fiable).
 *
 * Chaîne de mesure : masse du ballon (choisie selon l'athlète) + distance du
 * lancer assis (meilleur de N) → **indice = masse × distance** (kg·m), la
 * grandeur effectivement scorée par le barème.
 *
 * Pourquoi cet indice ? À angle de lâcher standardisé (~45°), la distance d'un
 * projectile vaut d ≈ v²/g, donc l'énergie cinétique imprimée au ballon
 * E = ½·m·v² = ½·m·g·d est **proportionnelle à masse × distance**. Scorer
 * `masse × distance` plutôt que la distance brute permet de **choisir la masse
 * adaptée à chaque athlète** (un ballon trop léger plafonne chez un homme, trop
 * lourd est inatteignable chez une femme) tout en gardant une échelle unique.
 *
 * HYPOTHÈSE (documentée, barème `transposed`) : iso-performance = iso-énergie,
 * soit la courbe d'iso-score `distance ∝ 1/masse`. En pratique, par la relation
 * force-vitesse, un athlète produit un peu PLUS de travail à charge lourde →
 * une masse plus lourde peut légèrement majorer le score absolu. Conséquence
 * d'usage : pour le **suivi d'un même nageur**, garder la **même masse** d'un
 * bilan à l'autre. Le barème est calé sur les normes scolaires 2 kg (lancer
 * assis), cf. `kpiBaremes.ts`.
 */

/** Résultat structuré d'un lancer médecine-ball assis. */
export interface MedballThrowResult {
  /** Indice scoré par le barème (kg·m) = masse × meilleure distance (m). */
  value: number;
  /** Masse du ballon utilisée (kg) — à conserver d'un bilan à l'autre. */
  ballMassKg: number;
  /** Meilleur essai retenu (cm). */
  bestDistanceCm: number;
  /** Meilleur essai en mètres (commodité d'affichage). */
  bestDistanceM: number;
}

/**
 * Calcule l'indice balistique à partir de la masse du ballon (kg) et des
 * distances d'essai (cm). Retient le meilleur essai.
 *
 * Lève une `Error` si la masse est ≤ 0 ou si aucune distance positive n'est
 * fournie (dégradation explicite, jamais de NaN silencieux).
 */
export function medballThrowResult(
  ballMassKg: number,
  distancesCm: number[],
): MedballThrowResult {
  if (!(ballMassKg > 0)) {
    throw new Error('medballThrowResult: masse du ballon doit être > 0');
  }
  const positives = distancesCm.filter((d) => Number.isFinite(d) && d > 0);
  if (positives.length === 0) {
    throw new Error('medballThrowResult: au moins une distance > 0 requise');
  }
  const bestDistanceCm = Math.max(...positives);
  const bestDistanceM = bestDistanceCm / 100;
  return {
    value: ballMassKg * bestDistanceM,
    ballMassKg,
    bestDistanceCm,
    bestDistanceM,
  };
}
