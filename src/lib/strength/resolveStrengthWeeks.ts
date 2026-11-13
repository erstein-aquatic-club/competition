/**
 * Selects the effective workout plan ONE WEEK AT A TIME.
 *
 * The old MyPlanTab resolved a single source for the whole 12-week horizon:
 * any active mesocycle + one slot forced Phase 2 for every week, even after
 * that cycle's end. This resolver restricts ownership to the actual cycle
 * window and lets the next week use its own available plan.
 *
 * This is a read-only view concern: no assignments or sessions are altered.
 */

export interface CycleWindow {
  start_week_monday: string | null;
  target_week_count: number;
}

export interface WeekWithKey {
  week: { weekKey: string };
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function mondayTimestamp(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  // Only valid ISO calendar Mondays may define a week boundary.
  const date = new Date(ms);
  if (date.toISOString().slice(0, 10) !== iso || date.getUTCDay() !== 1) {
    return null;
  }
  return ms;
}

/** True only for Mondays belonging to [start, start + count weeks). */
export function cycleCoversWeek(
  weekKey: string,
  cycle: CycleWindow | null | undefined,
): boolean {
  if (!cycle?.start_week_monday || !Number.isInteger(cycle.target_week_count) ||
      cycle.target_week_count <= 0) return false;
  const start = mondayTimestamp(cycle.start_week_monday);
  const current = mondayTimestamp(weekKey);
  if (start === null || current === null) return false;
  const weeks = (current - start) / MS_PER_WEEK;
  return Number.isInteger(weeks) && weeks >= 0 && weeks < cycle.target_week_count;
}

/**
 * During an individual cycle, only explicitly overridden slots are visible:
 * a group-only slot on an unprogrammed day must not add a workout.
 * Outside that window group slots remain available as before.
 */
export function isSlotVisibleForCycle(
  slot: { week_start: string; overridden?: boolean },
  activeCycle: CycleWindow | null | undefined,
): boolean {
  return !cycleCoversWeek(slot.week_start, activeCycle) || slot.overridden === true;
}

export interface StrengthWeekSources<T extends WeekWithKey> {
  weekKeys: readonly string[];
  /** Merged athlete/group dated slots (even empty active-cycle weeks). */
  dated: readonly T[];
  /** Materialized training_plan applications. */
  applications: readonly T[];
  /** Legacy personal folders (last resort). */
  folders: readonly T[];
  activeCycle: CycleWindow | null | undefined;
}

/**
 * One WeekInstance per week at most, with the following order:
 * - inside the active cycle: its dated week (including a rest week); never
 *   inherit a stale application/folder when this week intentionally has none;
 * - outside it: application > dated slots > personal folders.
 *
 * The "dated" collection must include empty weeks within the active cycle.
 */
export function resolveStrengthWeeks<T extends WeekWithKey>({
  weekKeys, dated, applications, folders, activeCycle,
}: StrengthWeekSources<T>): T[] {
  const byWeek = (weeks: readonly T[]) =>
    new Map(weeks.map((week) => [week.week.weekKey, week] as const));
  const datedByWeek = byWeek(dated);
  const applicationsByWeek = byWeek(applications);
  const foldersByWeek = byWeek(folders);

  const result: T[] = [];
  for (const weekKey of weekKeys) {
    const chosen = cycleCoversWeek(weekKey, activeCycle)
      ? datedByWeek.get(weekKey)
      : (applicationsByWeek.get(weekKey) ??
        datedByWeek.get(weekKey) ??
        foldersByWeek.get(weekKey));
    if (chosen) result.push(chosen);
  }
  return result;
}
