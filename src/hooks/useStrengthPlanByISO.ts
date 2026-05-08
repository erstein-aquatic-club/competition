import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getStrengthPlanningSlots,
  getStrengthPlanningSlotOverrides,
  getStrengthSessions,
} from "@/lib/api";
import type { StrengthSessionTemplate } from "@/lib/api/types";
import {
  mergeStrengthSlots,
  type EffectiveStrengthSlot,
} from "@/lib/strengthPlanningMerge";

/**
 * Reads the strength plan (group slots + per-athlete overrides) and produces
 * an iso → slot[] map suitable for the swimmer calendar / day drawer.
 *
 * Per the §157 contract enforced by mergeStrengthSlots:
 *  - athlete overrides win on (week_start, day_of_week, time_slot) match
 *  - athlete-only entries (no group slot at the same key) are kept
 *
 * → an individual plan is never silently overwritten by a group plan, even
 *   if the coach later applies a group plan covering the same week.
 */

const PLAN_WEEK_COUNT = 12;

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Mirror of MyPlanTab's helper but starts on the previous Monday so a swimmer
 *  who opens the calendar on a Sunday evening still sees the current week's
 *  remaining strength sessions. Exported for unit testing — pure function of
 *  the system clock.
 *
 *  We format week starts via local-date components rather than
 *  `toISOString().split("T")` because the latter converts to UTC and silently
 *  shifts the date by one day in any TZ east of UTC (Monday 00:00 CEST →
 *  "2026-04-19" instead of "2026-04-20"). The downstream
 *  strength_planning_slots query keys on those exact strings, so the shift
 *  produced empty result sets at midnight Europe time. */
export function buildWeekStarts(count: number, today: Date = new Date()): string[] {
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  const starts: string[] = [];
  // Include previous week so late-Sunday completions still resolve.
  for (let i = -1; i < count; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i * 7);
    starts.push(toLocalISODate(d));
  }
  return starts;
}

/** Resolve a (week_start, day_of_week 0=Mon..6=Sun) pair to an ISO date.
 *  Exported for unit testing. */
export function isoFromWeekStartAndDay(weekStart: string, dayOfWeek: number): string {
  const d = new Date(weekStart + "T00:00:00");
  d.setDate(d.getDate() + dayOfWeek);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface ResolvedPlanEntry {
  slot: EffectiveStrengthSlot;
  /** May be undefined while the catalog is still loading or when the
   *  template referenced by the slot has been deleted. */
  session: StrengthSessionTemplate | undefined;
}

export interface UseStrengthPlanByISOResult {
  /** Keyed by ISO date "YYYY-MM-DD" — only days with at least one slot
   *  carrying a `session_template_id` are present. */
  planByISO: Map<string, EffectiveStrengthSlot[]>;
  /** Same shape as planByISO but with the session template resolved.
   *  Catalog query is shared with MyPlanTab via queryKey, so this is free
   *  when both are mounted. */
  resolvedByISO: Map<string, ResolvedPlanEntry[]>;
  /** Flat effective slots for the loaded window (12 weeks + previous week). */
  effectiveSlots: EffectiveStrengthSlot[];
  /** Cheap boolean lookup map for the calendar pill renderer. */
  strengthByISO: Record<string, boolean>;
}

export function useStrengthPlanByISO(
  athleteId: number | null | undefined,
  groupId: number | null | undefined,
): UseStrengthPlanByISOResult {
  const weekStarts = useMemo(() => buildWeekStarts(PLAN_WEEK_COUNT), []);

  const { data: groupSlots = [] } = useQuery({
    queryKey: ["strength_planning_slots", groupId, weekStarts],
    queryFn: () =>
      groupId
        ? getStrengthPlanningSlots({ groupId, weekStarts })
        : Promise.resolve([]),
    enabled: groupId != null,
    staleTime: 5 * 60 * 1000,
  });

  const { data: athleteOverrides = [] } = useQuery({
    queryKey: ["strength_planning_slot_overrides", athleteId, weekStarts],
    queryFn: () =>
      athleteId != null
        ? getStrengthPlanningSlotOverrides({ athleteId, weekStarts })
        : Promise.resolve([]),
    enabled: athleteId != null,
    staleTime: 5 * 60 * 1000,
  });

  const effectiveSlots = useMemo(
    () => mergeStrengthSlots(groupSlots, athleteOverrides),
    [groupSlots, athleteOverrides],
  );

  const planByISO = useMemo(() => {
    const map = new Map<string, EffectiveStrengthSlot[]>();
    for (const slot of effectiveSlots) {
      // A slot without a session_template_id is just a planning placeholder
      // (e.g. the coach reserved the time but hasn't picked a workout yet).
      // It shouldn't render a dumbbell on the calendar — there's nothing to
      // launch.
      if (!slot.session_template_id) continue;
      const iso = isoFromWeekStartAndDay(slot.week_start, slot.day_of_week);
      const existing = map.get(iso) ?? [];
      existing.push(slot);
      map.set(iso, existing);
    }
    return map;
  }, [effectiveSlots]);

  const strengthByISO = useMemo(() => {
    const result: Record<string, boolean> = {};
    planByISO.forEach((slots, iso) => {
      if (slots.length > 0) result[iso] = true;
    });
    return result;
  }, [planByISO]);

  // Resolve session templates for slots that carry a session_template_id.
  // Shared queryKey with MyPlanTab → no duplicate fetch.
  const { data: catalog = [] } = useQuery({
    queryKey: ["strength_catalog"],
    queryFn: () => getStrengthSessions(),
    enabled: planByISO.size > 0,
    staleTime: 5 * 60 * 1000,
  });

  const sessionsByTemplateId = useMemo(() => {
    const map = new Map<number, StrengthSessionTemplate>();
    for (const s of catalog) map.set(s.id, s);
    return map;
  }, [catalog]);

  const resolvedByISO = useMemo(() => {
    const result = new Map<string, ResolvedPlanEntry[]>();
    planByISO.forEach((slots, iso) => {
      const entries: ResolvedPlanEntry[] = slots.map((slot) => ({
        slot,
        session:
          slot.session_template_id != null
            ? sessionsByTemplateId.get(slot.session_template_id)
            : undefined,
      }));
      if (entries.length > 0) result.set(iso, entries);
    });
    return result;
  }, [planByISO, sessionsByTemplateId]);

  return { planByISO, resolvedByISO, effectiveSlots, strengthByISO };
}
