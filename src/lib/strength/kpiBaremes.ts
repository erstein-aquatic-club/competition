/**
 * Un barème = une liste d'ancres `[valeurBrute, score]` triées par
 * valeurBrute croissante (dérivées des percentiles de normes publiées).
 */
export type Bareme = readonly (readonly [number, number])[];

/**
 * Convertit une mesure brute en score [0, 100] par interpolation linéaire
 * par morceaux entre les ancres du barème.
 *
 *  - `value` sous la première ancre  → score de la première ancre (plancher) ;
 *  - `value` au-dessus de la dernière → score de la dernière ancre (plafond) ;
 *  - entre deux ancres                → interpolation linéaire ;
 *  - le résultat est borné à [0, 100].
 *
 * Lève une `Error` si le barème compte moins de 2 ancres.
 */
export function kpiScore(bareme: Bareme, value: number): number {
  if (bareme.length < 2) {
    throw new Error('kpiScore: bareme needs at least 2 anchors');
  }
  const clamp = (s: number): number => Math.min(100, Math.max(0, s));

  const first = bareme[0];
  const last = bareme[bareme.length - 1];
  if (value <= first[0]) return clamp(first[1]);
  if (value >= last[0]) return clamp(last[1]);

  for (let i = 1; i < bareme.length; i++) {
    const [x0, s0] = bareme[i - 1];
    const [x1, s1] = bareme[i];
    if (value <= x1) {
      const ratio = (value - x0) / (x1 - x0);
      return clamp(s0 + ratio * (s1 - s0));
    }
  }
  // Inatteignable : value est borné par les gardes ci-dessus.
  return clamp(last[1]);
}
