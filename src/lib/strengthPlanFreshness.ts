/**
 * Data whose freshness is essential for "Muscu > Mon plan" and the calendar.
 * Do not persist these queries as authoritative PWA snapshots: the server may
 * have received a new cycle or a coach edit since the last app launch.
 *
 * Keep this list in sync with query keys used by swimmer, coach and history
 * views (underscore AND hyphen legacy variants).
 */
export const STRENGTH_PLAN_QUERY_PREFIXES = [
  "strength-mesocycle-active",
  "strength-mesocycle-history",
  "strength-mesocycle-sessions",
  "strength-mesocycle-content",
  "strength_planning_slot_overrides",
  "strength_planning_week_overrides",
  "strength_planning_slots",
  "strength-planning-slot-overrides",
  "strength-planning-week-overrides",
  "strength-planning-slots",
  "strength-planning-week-meta",
  "training_plan_applications",
  "training_plan_sessions",
  "strength_catalog",
  "strength_folders",
] as const;

const strengthPlanKeys = new Set<string>(STRENGTH_PLAN_QUERY_PREFIXES);

export function isStrengthPlanQueryKey(key: readonly unknown[]): boolean {
  return typeof key[0] === "string" && strengthPlanKeys.has(key[0]);
}
