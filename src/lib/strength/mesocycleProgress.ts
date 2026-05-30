/**
 * Helpers PURS de guidage nageur sur le mésocycle actif (§341 Lot 3, finding V5).
 * Zéro I/O — alimentent le bandeau « objectif · Semaine X/Y · phase » de
 * « Mon plan ».
 */

const STROKE_LABEL_FR: Record<string, string> = {
  freestyle: 'crawl',
  butterfly: 'papillon',
  backstroke: 'dos',
  breaststroke: 'brasse',
  medley: '4 nages',
};

/** Libellé + unité de la distance (la clé `fond` = demi-fond ≥ 800 m). */
const DISTANCE_LABEL_FR: Record<string, string> = {
  '50': '50 m',
  '100': '100 m',
  '200': '200 m',
  '400plus': '400 m+',
  fond: 'demi-fond',
};

/**
 * `event_group` ('<nage>_<distance>', ex. 'freestyle_50') → libellé lisible
 * (« 50 m crawl »). Repli sur la chaîne brute si la nage OU la distance est
 * inconnue (jamais d'affichage trompeur).
 */
export function formatEventGroupLabel(eventGroup: string): string {
  const [strokePart, ...rest] = eventGroup.split('_');
  const distancePart = rest.join('_');
  const stroke = STROKE_LABEL_FR[strokePart];
  const distance = DISTANCE_LABEL_FR[distancePart];
  if (!stroke || !distance) return eventGroup;
  return `${distance} ${stroke}`;
}

export type MesocycleStatus = 'upcoming' | 'active' | 'done';

export interface MesocyclePosition {
  /** Numéro de semaine affiché, borné à [1, totalWeeks]. */
  weekNumber: number;
  totalWeeks: number;
  status: MesocycleStatus;
}

function parseISOUtc(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getTime();
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Position dans le cycle pour un lundi courant donné.
 * `startMonday`/`currentMonday` sont des ISO (YYYY-MM-DD) qui DOIVENT être des
 * lundis (le caller passe `getMonday(today)`). `weekNumber` est borné [1, total]
 * pour l'affichage ; `status` distingue avant/pendant/après le plan.
 */
export function mesocyclePosition(
  startMonday: string,
  totalWeeks: number,
  currentMonday: string,
): MesocyclePosition {
  const elapsed = Math.round(
    (parseISOUtc(currentMonday) - parseISOUtc(startMonday)) / MS_PER_WEEK,
  );
  const raw = elapsed + 1; // semaine 1-based
  let status: MesocycleStatus;
  if (raw < 1) status = 'upcoming';
  else if (raw > totalWeeks) status = 'done';
  else status = 'active';
  const weekNumber = Math.min(Math.max(raw, 1), totalWeeks);
  return { weekNumber, totalWeeks, status };
}
