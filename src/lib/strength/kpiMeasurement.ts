/** Sélection de l'essai retenu pour un KPI. Les 5 KPIs sont tous
 *  "valeur haute = meilleure" → on retient le maximum. */
export function bestAttempt(attempts: number[]): number {
  if (attempts.length === 0) {
    throw new Error('bestAttempt: need at least one attempt');
  }
  return Math.max(...attempts);
}

/**
 * Parse the raw attempt strings entered in the KPI wizard into the finite,
 * strictly-positive numbers actually entered.
 *
 * Sanitization rules:
 *  - empty / whitespace-only strings are dropped;
 *  - a comma decimal separator is normalised to a dot ("38,5" → 38.5);
 *  - non-numeric garbage (NaN) is dropped;
 *  - zero and negative values are rejected (a KPI measurement is always > 0).
 */
export function parseAttempts(raw: string[]): number[] {
  return raw
    .map((v) => Number(String(v).replace(',', '.')))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * Parse a single raw input string into a finite, strictly-positive number,
 * or `null` when the input is empty / non-numeric / non-positive.
 *
 * Same sanitization rules as `parseAttempts` (comma → dot, reject ≤ 0 and
 * NaN/Infinity) but for a standalone field — used for the body-weight input
 * of the vertical-jump KPI step.
 */
export function parsePositiveNumber(raw: string): number | null {
  const n = Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}
