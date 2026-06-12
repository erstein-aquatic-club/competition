/**
 * Helpers PURS de la frise « parcours du cycle » côté coach (§380).
 * Zéro I/O — alimentent `AttendanceMesocycleJourney` (carte d'assiduité muscu
 * dépliée) : liste des lundis du mésocycle + regroupement des semaines en
 * segments de phase consécutifs (Force max ×3, Affûtage ×2, …).
 *
 * Source des labels : `strength_planning_week_overrides.week_type` matérialisé
 * par la RPC apply — fidèle aux mésos ajustés mi-cycle (§338), contrairement à
 * une recomposition de template qui ignorerait `startPhase`.
 */

import { addDaysIso } from '@/lib/date';

/** Une semaine du mésocycle, avec son label de phase matérialisé (ou null). */
export interface CycleJourneyWeek {
  /** Lundi ISO 'YYYY-MM-DD'. */
  weekStart: string;
  /** `week_type` du week_override (label FR), null si non matérialisé. */
  label: string | null;
}

/** Position temporelle d'un segment par rapport à la semaine courante. */
export type SegmentTiming = 'past' | 'current' | 'upcoming';

/** Un bloc de semaines consécutives partageant le même label de phase. */
export interface CyclePhaseSegment {
  /** Label de phase (FR) ; null si les semaines n'ont pas de week_override. */
  label: string | null;
  /** Index 0-based de la première semaine du segment dans le méso. */
  startIndex: number;
  weekCount: number;
  /** Lundi ISO de la première semaine du segment. */
  weekStart: string;
  timing: SegmentTiming;
}

/** Lundis ISO des `totalWeeks` semaines du méso à partir de `startMonday`. */
export function buildJourneyWeekStarts(
  startMonday: string,
  totalWeeks: number,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < totalWeeks; i++) out.push(addDaysIso(startMonday, i * 7));
  return out;
}

/**
 * Regroupe les semaines en segments de phase consécutifs et qualifie chaque
 * segment (passé / en cours / à venir) par rapport au lundi courant.
 *
 * `currentMonday` DOIT être un lundi ISO (le caller passe `getMonday(today)`).
 * Un segment est `current` si `currentMonday` tombe dans [première, dernière]
 * semaine du segment — y compris quand son label est null.
 */
export function groupPhaseSegments(
  weeks: CycleJourneyWeek[],
  currentMonday: string,
): CyclePhaseSegment[] {
  const segments: CyclePhaseSegment[] = [];
  for (let i = 0; i < weeks.length; i++) {
    const w = weeks[i];
    const last = segments[segments.length - 1];
    if (last && last.label === w.label) {
      last.weekCount += 1;
    } else {
      segments.push({
        label: w.label,
        startIndex: i,
        weekCount: 1,
        weekStart: w.weekStart,
        timing: 'upcoming', // recalculé ci-dessous
      });
    }
  }
  for (const seg of segments) {
    const lastWeekStart = addDaysIso(seg.weekStart, (seg.weekCount - 1) * 7);
    seg.timing =
      lastWeekStart < currentMonday
        ? 'past'
        : seg.weekStart > currentMonday
          ? 'upcoming'
          : 'current';
  }
  return segments;
}
