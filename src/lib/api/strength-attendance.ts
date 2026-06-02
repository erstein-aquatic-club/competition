import { supabase, canUseSupabase, assertSupabase } from "./client";
import type { AttendancePlannedSlot, AttendanceRun } from "@/lib/strength/attendance";

export interface StrengthAttendanceData {
  plannedSlots: AttendancePlannedSlot[];
  runs: AttendanceRun[];
}

/**
 * Récupération batchée des données d'assiduité muscu (coach, lecture seule).
 * @param athleteIds nageurs à mésocycle actif
 * @param weekStarts lundis ISO de la période
 * @param fromISO borne basse runs ("YYYY-MM-DD", = 1er lundi)
 * @param toISO   borne haute runs ("YYYY-MM-DD", = dernier dimanche)
 */
export async function getStrengthAttendanceData(
  athleteIds: number[],
  weekStarts: string[],
  fromISO: string,
  toISO: string,
): Promise<StrengthAttendanceData> {
  if (!canUseSupabase() || athleteIds.length === 0 || weekStarts.length === 0) {
    return { plannedSlots: [], runs: [] };
  }
  const slotsRaw = assertSupabase(
    await supabase
      .from("strength_planning_slot_overrides")
      .select("athlete_id, week_start, day_of_week, session_template_id")
      .in("athlete_id", athleteIds)
      .in("week_start", weekStarts),
  );
  // Fenêtre runs : on garde les runs qui chevauchent la période sur l'UNE OU
  // l'AUTRE borne. L'agrégateur pur (src/lib/strength/attendance.ts, runDay)
  // bucketise un run COMPLETED par completed_at — donc une séance démarrée le
  // dimanche AVANT fromISO mais terminée sur fromISO doit être ramenée. La
  // clause started_at couvre les runs in_progress (completed_at null), la
  // clause completed_at rattrape les séances à cheval sur la borne. Sur-
  // récupérer un peu est sans effet : l'agrégateur cape/filtre correctement.
  //
  // Convention de fenêtre : fromISO/toISO viennent du board via getMonday/
  // toISODate en heure LOCALE, tandis que l'agrégateur bucketise par jour
  // calendaire UTC du timestamp → une séance faite à ~1-2h de minuit local
  // peut tomber un jour à côté dans la bande (accepté pour v1, documenté).
  const upper = toISO + "T23:59:59";
  const runsRaw = assertSupabase(
    await supabase
      .from("strength_session_runs")
      .select("athlete_id, session_id, status, started_at, completed_at")
      .in("athlete_id", athleteIds)
      .or(
        `and(started_at.gte.${fromISO},started_at.lte.${upper}),` +
        `and(completed_at.gte.${fromISO},completed_at.lte.${upper})`,
      ),
  );
  const plannedSlots: AttendancePlannedSlot[] = ((slotsRaw ?? []) as any[]).map((s) => ({
    athleteId: s.athlete_id,
    weekStart: s.week_start,
    dayOfWeek: s.day_of_week,
    sessionTemplateId: s.session_template_id ?? null,
  }));
  const runs: AttendanceRun[] = ((runsRaw ?? []) as any[]).map((r) => ({
    athleteId: r.athlete_id,
    sessionId: r.session_id ?? null,
    status: r.status,
    startedAt: r.started_at ?? null,
    completedAt: r.completed_at ?? null,
  }));
  return { plannedSlots, runs };
}
