/**
 * derivePlanByWeekDay — pure function that maps a sliding window of weeks
 * to the training_plan_sessions that should populate each cell, given a
 * set of active applications for the athlete.
 *
 * Used by StrengthPlanningScreen (§275.6) in athlete mode to render the
 * planning timeline as a derived view of the training_plans the athlete
 * is enrolled in.
 *
 * Pure / framework-agnostic so we can unit-test the matching logic
 * (relative_week computation, application priority on overlap, etc.)
 * without React or Supabase.
 */
import type { TrainingPlanSession } from "@/lib/api/types";
import type { ActiveTrainingPlanApplication } from "@/lib/api/training-plans";

export interface DerivePlanByWeekDayInput {
  /** ISO week-start Mondays (YYYY-MM-DD) for the visible window. */
  weekKeys: string[];
  /** All applications targeting the athlete (direct or via group). */
  applications: ActiveTrainingPlanApplication[];
  /** All training_plan_sessions across the applications' plans. */
  sessions: TrainingPlanSession[];
}

export interface DerivedCell {
  /** plan_id of the application that contributed this cell. */
  planId: number;
  /** Human-readable plan name (for badges/tooltips). */
  planName: string;
  /** The matched training_plan_sessions row. */
  session: TrainingPlanSession;
  /** Relative week (1-indexed) within the plan. */
  relativeWeek: number;
}

/**
 * For each weekKey, build a `Map<dayIndex (0-6), DerivedCell>` of the
 * sessions inherited from the athlete's active training plan applications.
 *
 * Conflict resolution: if multiple applications cover the same (weekKey, day),
 * the application with the **most recent `start_date`** wins (applications
 * are expected to come pre-sorted by start_date desc).
 */
export function derivePlanByWeekDay({
  weekKeys,
  applications,
  sessions,
}: DerivePlanByWeekDayInput): Map<string, Map<number, DerivedCell>> {
  const result = new Map<string, Map<number, DerivedCell>>();
  if (weekKeys.length === 0 || applications.length === 0 || sessions.length === 0) {
    return result;
  }

  // Index sessions by (plan_id, relative_week) → Map<dayIndex, session>
  const sessionsByPlanWeek = new Map<string, Map<number, TrainingPlanSession>>();
  for (const s of sessions) {
    const key = `${s.plan_id}|${s.relative_week}`;
    let dayMap = sessionsByPlanWeek.get(key);
    if (!dayMap) {
      dayMap = new Map();
      sessionsByPlanWeek.set(key, dayMap);
    }
    dayMap.set(s.day_of_week, s);
  }

  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
  // §275.6 — parse with explicit "Z" so DST transitions (e.g. last Sunday
  // of March in France) don't shift the difference below an exact multiple
  // of 7 days. The ISO date strings are calendar-only; UTC interpretation
  // keeps the math integer-clean.
  const parseDateUtc = (iso: string) => new Date(iso + "T00:00:00Z");

  for (const weekKey of weekKeys) {
    const weekMonday = parseDateUtc(weekKey);
    if (Number.isNaN(weekMonday.getTime())) continue;
    const weekMondayTs = weekMonday.getTime();

    // Find the best application covering this week. Applications are sorted
    // by start_date desc, so the first match wins.
    for (const app of applications) {
      const start = parseDateUtc(app.start_date);
      if (Number.isNaN(start.getTime())) continue;
      if (start.getTime() > weekMondayTs) continue; // future start

      // end check: if end_date set, must be >= weekMonday
      if (app.end_date) {
        const end = parseDateUtc(app.end_date);
        if (end.getTime() < weekMondayTs) continue;
      }

      // relative_week = floor((weekMonday - start) / 7days) + 1
      const weeksSinceStart = Math.floor((weekMondayTs - start.getTime()) / MS_PER_WEEK);
      const relativeWeek = weeksSinceStart + 1;
      if (relativeWeek < 1 || relativeWeek > app.plan_num_weeks) continue;

      const dayMap = sessionsByPlanWeek.get(`${app.plan_id}|${relativeWeek}`);
      if (!dayMap || dayMap.size === 0) {
        // Plan covers this week but has no sessions defined for it (rest week).
        // We still mark this application as the "owner" of the week so a later
        // application doesn't override it — biblio author intent is that the
        // week is empty on purpose.
        break;
      }

      const derived = new Map<number, DerivedCell>();
      for (const [dayIndex, session] of dayMap) {
        derived.set(dayIndex, {
          planId: app.plan_id,
          planName: app.plan_name,
          session,
          relativeWeek,
        });
      }
      result.set(weekKey, derived);
      break;
    }
  }

  return result;
}
