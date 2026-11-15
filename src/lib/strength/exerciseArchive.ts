/**
 * §394 (audit muscu 2ᵉ passe, R3/O1) — usages d'un exercice / d'une séance du
 * catalogue, pour décider et annoncer ce qu'implique une suppression.
 *
 * Exercice : `strength_session_items`, `strength_set_logs` et `one_rm_records`
 * étaient en `ON DELETE CASCADE` → supprimer un exo effaçait les séries et 1RM de
 * TOUS les nageurs. Désormais (mig 00231) la base refuse (RESTRICT) : un exo
 * utilisé s'archive (`archived_at`) — retiré du catalogue, des sélecteurs et du
 * moteur de mésocycle, historique conservé.
 *
 * Séance : la suppression reste possible (FK `SET NULL`), mais vide les créneaux
 * de planification et cases de plan qui la référencent — on l'annonce.
 */

export interface ExerciseUsage {
  /** Séances-modèles distinctes contenant l'exercice. */
  sessions: number;
  /** Séries enregistrées (tous nageurs). */
  setLogs: number;
  /** Records 1RM (tous nageurs). */
  oneRms: number;
  /** Routines d'échauffement (commune + activation par seau) qui le listent. */
  warmups: number;
}

export interface SessionUsage {
  /** Créneaux de planification (groupe + surcharges nageur). */
  planningSlots: number;
  /** Cases de plans d'entraînement. */
  planSessions: number;
}

export function isExerciseInUse(u: ExerciseUsage): boolean {
  return u.sessions + u.setLogs + u.oneRms + u.warmups > 0;
}

function joinFr(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** « 3 séances, 120 séries enregistrées, 4 1RM et une routine d'échauffement ». */
export function exerciseUsageText(u: ExerciseUsage): string {
  const parts: string[] = [];
  if (u.sessions > 0) parts.push(plural(u.sessions, "séance", "séances"));
  if (u.setLogs > 0) parts.push(plural(u.setLogs, "série enregistrée", "séries enregistrées"));
  if (u.oneRms > 0) parts.push(`${u.oneRms} 1RM`);
  if (u.warmups === 1) parts.push("une routine d'échauffement");
  else if (u.warmups > 1) parts.push(`${u.warmups} routines d'échauffement`);
  return joinFr(parts);
}

/** « 5 créneaux de planification et 1 plan d'entraînement » ; "" si rien. */
export function sessionUsageText(u: SessionUsage): string {
  const parts: string[] = [];
  if (u.planningSlots > 0)
    parts.push(plural(u.planningSlots, "créneau de planification", "créneaux de planification"));
  if (u.planSessions > 0)
    parts.push(plural(u.planSessions, "plan d'entraînement", "plans d'entraînement"));
  return joinFr(parts);
}

/**
 * Exercices proposables dans un sélecteur : sans les archivés, sauf celui déjà
 * choisi (une séance existante qui le contient reste lisible et éditable).
 */
export function selectableExercises<T extends { id: number; archived_at?: string | null }>(
  list: T[],
  keepId?: number | null,
): T[] {
  return list.filter((e) => !e.archived_at || (keepId != null && e.id === keepId));
}
