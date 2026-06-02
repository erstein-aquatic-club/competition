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
  const runsRaw = assertSupabase(
    await supabase
      .from("strength_session_runs")
      .select("athlete_id, session_id, status, started_at, completed_at")
      .in("athlete_id", athleteIds)
      .gte("started_at", fromISO)
      .lte("started_at", toISO + "T23:59:59"),
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
