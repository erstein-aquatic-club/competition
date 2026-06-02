/**
 * Pure attendance ("assiduité") aggregator for the strength module.
 *
 * Compares PLANNED strength sessions against what was actually DONE/STARTED:
 *  - "planned"  = rows of `strength_planning_slot_overrides`
 *                 (week_start = Monday ISO, day_of_week 0=Mon…6=Sun, session_template_id).
 *  - "done"     = `strength_session_runs` with status "completed".
 *  - "started"  = `strength_session_runs` with status "in_progress".
 *
 * The volume goal (%) is computed at WEEK granularity, so a Monday session
 * actually performed on Tuesday still counts toward the week (décalage
 * tolerance): pct = completedRuns(in week) / plannedSlots(in week).
 *
 * Pure TypeScript: no React, no Supabase, no I/O. Tested with node:test.
 */

export interface AttendancePlannedSlot {
  athleteId: number;
  /** Monday ISO date "YYYY-MM-DD". */
  weekStart: string;
  /** 0=Mon … 6=Sun. */
  dayOfWeek: number;
  sessionTemplateId: number | null;
}

export interface AttendanceRun {
  athleteId: number;
  sessionId: number | null;
  status: "in_progress" | "completed" | "abandoned";
  /** UTC ISO timestamp (must end with "Z"); the calendar day is derived UTC-side. */
  startedAt: string | null;
  /** UTC ISO timestamp (must end with "Z"); the calendar day is derived UTC-side. */
  completedAt: string | null;
}

export type AttendanceDayStatus =
  | "completed"
  | "started"
  | "planned"
  | "shifted"
  | "todo"
  | "none";

export interface AttendanceDay {
  date: string;
  status: AttendanceDayStatus;
}

export interface AttendanceWeek {
  weekStart: string;
  planned: number;
  completed: number;
  pct: number | null;
}

export interface AttendanceAthlete {
  athleteId: number;
  weeks: AttendanceWeek[];
  days: AttendanceDay[];
}

export interface ComputeAttendanceInput {
  athleteIds: number[];
  plannedSlots: AttendancePlannedSlot[];
  runs: AttendanceRun[];
  periodWeekStarts: string[];
  today: string;
}

/** Add `n` days to an ISO "YYYY-MM-DD" date, UTC-safe. */
function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** weekStart + dayOfWeek days (UTC-safe). */
export function slotDate(weekStart: string, dayOfWeek: number): string {
  return addDaysISO(weekStart, dayOfWeek);
}

/** Each week × 7 days, in order. */
export function periodDays(periodWeekStarts: string[]): string[] {
  const out: string[] = [];
  for (const ws of periodWeekStarts) {
    for (let i = 0; i < 7; i++) {
      out.push(addDaysISO(ws, i));
    }
  }
  return out;
}

/**
 * The Monday-ISO strings of a period of `weeks` weeks shifted by `offset`
 * blocks. offset 0 = current period ending on today's week, going back
 * `weeks-1` weeks.
 */
export function derivePeriodWeekStarts(
  todayMondayISO: string,
  weeks: 1 | 2 | 4,
  offset: number,
): string[] {
  const lastMonday = addDaysISO(todayMondayISO, offset * weeks * 7);
  const firstMonday = addDaysISO(lastMonday, -(weeks - 1) * 7);
  const out: string[] = [];
  for (let i = 0; i < weeks; i++) {
    out.push(addDaysISO(firstMonday, i * 7));
  }
  return out;
}

/** The weekStart in periodWeekStarts whose [ws, ws+6] contains date, else periodWeekStarts[0] ?? date. */
function mondayOf(date: string, periodWeekStarts: string[]): string {
  for (const ws of periodWeekStarts) {
    const end = addDaysISO(ws, 6);
    if (date >= ws && date <= end) return ws;
  }
  return periodWeekStarts[0] ?? date;
}

/** The UTC calendar day ("YYYY-MM-DD") on which a run lands: completedAt for done runs, else startedAt. */
function runDay(r: AttendanceRun): string {
  return ((r.status === "completed" ? (r.completedAt ?? r.startedAt) : r.startedAt) ?? "").slice(0, 10);
}

export function computeAttendance(
  input: ComputeAttendanceInput,
): AttendanceAthlete[] {
  const { athleteIds, plannedSlots, runs, periodWeekStarts, today } = input;
  const allDays = periodDays(periodWeekStarts);

  return athleteIds.map((athleteId) => {
    const aSlots = plannedSlots.filter(
      (s) => s.athleteId === athleteId && s.sessionTemplateId != null,
    );
    const aRuns = runs.filter((r) => r.athleteId === athleteId);
    const templateIds = new Set(
      aSlots.map((s) => s.sessionTemplateId).filter((id): id is number => id != null),
    );

    const weeks: AttendanceWeek[] = periodWeekStarts.map((weekStart) => {
      const weekEnd = addDaysISO(weekStart, 6);
      const planned = aSlots.filter((s) => s.weekStart === weekStart).length;
      const completedRuns = aRuns.filter((r) => {
        if (r.status !== "completed") return false;
        if (r.sessionId == null || !templateIds.has(r.sessionId)) return false;
        const day = runDay(r);
        return day >= weekStart && day <= weekEnd;
      }).length;
      const completed = Math.min(completedRuns, planned);
      const pct = planned > 0 ? Math.round((completed / planned) * 100) : null;
      return { weekStart, planned, completed, pct };
    });

    const pctByWeek = new Map<string, number | null>(
      weeks.map((w) => [w.weekStart, w.pct]),
    );

    const days: AttendanceDay[] = allDays.map((date) => {
      const weekStart = mondayOf(date, periodWeekStarts);
      const dayRuns = aRuns.filter((r) => {
        if (r.sessionId == null || !templateIds.has(r.sessionId)) return false;
        if (r.status === "completed" || r.status === "in_progress") {
          return runDay(r) === date;
        }
        return false;
      });
      const hasCompleted = dayRuns.some((r) => r.status === "completed");
      const hasStarted = dayRuns.some((r) => r.status === "in_progress");
      const plannedThisDay = aSlots.some((s) => slotDate(s.weekStart, s.dayOfWeek) === date);

      let status: AttendanceDayStatus;
      if (hasCompleted) {
        status = "completed";
      } else if (hasStarted) {
        status = "started";
      } else if (plannedThisDay) {
        if (date >= today) {
          status = "planned";
        } else {
          // "shifted": the week target was met, so this planned slot's work happened
          // on another day (heuristic — not a tracked per-session displacement).
          status = (pctByWeek.get(weekStart) ?? 0) === 100 ? "shifted" : "todo";
        }
      } else {
        status = "none";
      }
      return { date, status };
    });

    return { athleteId, weeks, days };
  });
}
