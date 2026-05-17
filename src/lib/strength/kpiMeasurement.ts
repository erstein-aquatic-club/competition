/** Sélection de l'essai retenu pour un KPI. Les 5 KPIs sont tous
 *  "valeur haute = meilleure" → on retient le maximum. */
export function bestAttempt(attempts: number[]): number {
  if (attempts.length === 0) {
    throw new Error('bestAttempt: need at least one attempt');
  }
  return Math.max(...attempts);
}
