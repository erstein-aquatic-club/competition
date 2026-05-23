/** Sélection de l'essai retenu pour un KPI. Les 5 KPIs sont tous
 *  "valeur haute = meilleure" → on retient le maximum. */
export function bestAttempt(attempts: number[]): number {
  if (attempts.length === 0) {
    throw new Error('bestAttempt: need at least one attempt');
  }
  return Math.max(...attempts);
}

/** Options de `parseAttempts`. */
export interface ParseAttemptsOptions {
  /**
   * Autorise les valeurs ≤ 0. Réservé au KPI `weighted_pullup` dont la charge
   * additionnelle peut être nulle (1 traction au poids de corps) ou négative
   * (assistée à l'élastique) — le barème a des ancres ≤ 0. Par défaut `false`
   * (les 4 autres KPIs sont strictement positifs).
   */
  allowNonPositive?: boolean;
}

/**
 * Parse the raw attempt strings entered in the KPI wizard into finite numbers.
 *
 * Sanitization rules:
 *  - empty / whitespace-only strings are dropped;
 *  - a comma decimal separator is normalised to a dot ("38,5" → 38.5);
 *  - non-finite garbage (NaN / Infinity) is dropped;
 *  - zero and negative values are rejected — UNLESS `allowNonPositive` is set
 *    (a KPI measurement is normally > 0; `weighted_pullup` is the exception).
 */
export function parseAttempts(
  raw: string[],
  { allowNonPositive = false }: ParseAttemptsOptions = {},
): number[] {
  return raw
    .filter((v) => String(v).trim() !== '')
    .map((v) => Number(String(v).replace(',', '.')))
    .filter((n) => Number.isFinite(n) && (allowNonPositive || n > 0));
}

/**
 * Nettoie une saisie numérique en cours de frappe (champ texte du wizard) :
 * ne conserve que les chiffres et les séparateurs décimaux (`.` `,`).
 *
 * `allowNegative` (réservé à `weighted_pullup`) conserve **un** signe `−` mais
 * uniquement **en tête** (une charge assistée se note `-7,5`) ; un `−` intercalé
 * est supprimé, et plusieurs `−` de tête sont réduits à un seul. Par défaut le
 * signe est strippé (les autres KPIs sont positifs).
 */
export function sanitizeNumericInput(value: string, allowNegative = false): string {
  const body = value.replace(/[^\d.,]/g, '');
  if (allowNegative && value.trimStart().startsWith('-')) {
    return `-${body}`;
  }
  return body;
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
