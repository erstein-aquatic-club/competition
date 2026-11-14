/**
 * Mésocycle coach : métadonnées persistées et dates, sans recalculer le plan.
 * Les PDF externes peuvent stocker un jour de semaine à index 0 (lundi) :
 * l'index zéro est une séance légitime, pas une absence de donnée.
 */
export interface AuditSessionMeta {
  weekNumber: number;
  sessionNumber: number;
}
export function readAuditSessionMeta(payload: Record<string, unknown>): AuditSessionMeta | null {
  if (payload.week_number === null || payload.week_number === undefined ||
      payload.session_number === null || payload.session_number === undefined ||
      payload.week_number === "" || payload.session_number === "") return null;
  const weekNumber = Number(payload.week_number);
  const sessionNumber = Number(payload.session_number);
  if (!Number.isInteger(weekNumber) || weekNumber <= 0 ||
      !Number.isInteger(sessionNumber) || sessionNumber < 0) return null;
  return { weekNumber, sessionNumber };
}

/** Les plans externes gardent le libellé métier (Force I, Affûtage, etc.). */
export function auditSourcePhase(payload: Record<string, unknown>): string {
  const phase = payload.source_phase;
  if (typeof phase === "string" && phase.trim()) return phase.trim();
  const cycle = payload.periodization_cycle;
  return typeof cycle === "string" ? cycle.trim() : "";
}

/** Semaine 1 = date de départ ; calcul UTC indépendant des changements d'heure. */
export function auditWeekStart(startMonday: string | null | undefined, weekNumber: number): string | null {
  if (!startMonday || !/^\d{4}-\d{2}-\d{2}$/.test(startMonday) ||
      !Number.isInteger(weekNumber) || weekNumber <= 0) return null;
  const date = new Date(startMonday + "T00:00:00Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== startMonday ||
      date.getUTCDay() !== 1) return null;
  date.setUTCDate(date.getUTCDate() + (weekNumber - 1) * 7);
  return date.toISOString().slice(0, 10);
}
