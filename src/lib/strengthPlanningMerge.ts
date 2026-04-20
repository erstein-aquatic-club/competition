/**
 * Merge helpers for strength_planning_* tables.
 * Mirror of swimPlanningMerge.ts — Phase 2 §157.
 *
 * Group-level slots are the base; per-athlete overrides take precedence
 * on a per-(week, day, time_slot) basis. Override-only slots (no group slot)
 * are included as-is (athlete-specific additions).
 */
import type {
  StrengthPlanningSlot,
  StrengthPlanningSlotOverride,
  StrengthPlanningWeekMeta,
  StrengthPlanningWeekOverride,
} from "@/lib/api/types";

export interface EffectiveStrengthSlot {
  id: string;
  group_id?: number;
  athlete_id?: number;
  week_start: string;
  day_of_week: number;
  time_slot: "morning" | "evening";
  session_template_id: number | null;
  notes: string | null;
  overridden?: boolean;
  overrideId?: string;
}

export interface EffectiveStrengthWeekMeta {
  week_type: string | null;
  notes: string | null;
  source: "group" | "athlete" | "none";
}

function slotKey(s: {
  week_start: string;
  day_of_week: number;
  time_slot: string;
}): string {
  return `${s.week_start}|${s.day_of_week}|${s.time_slot}`;
}

export function mergeStrengthSlots(
  groupSlots: StrengthPlanningSlot[],
  athleteOverrides: StrengthPlanningSlotOverride[],
): EffectiveStrengthSlot[] {
  const overrideMap = new Map<string, StrengthPlanningSlotOverride>();
  for (const o of athleteOverrides) overrideMap.set(slotKey(o), o);

  const result: EffectiveStrengthSlot[] = [];
  const seen = new Set<string>();

  for (const g of groupSlots) {
    const k = slotKey(g);
    seen.add(k);
    const ov = overrideMap.get(k);
    if (ov) {
      result.push({
        id: g.id,
        group_id: g.group_id,
        week_start: g.week_start,
        day_of_week: g.day_of_week,
        time_slot: g.time_slot,
        session_template_id: ov.session_template_id ?? null,
        notes: ov.notes ?? null,
        overridden: true,
        overrideId: ov.id,
      });
    } else {
      result.push({
        id: g.id,
        group_id: g.group_id,
        week_start: g.week_start,
        day_of_week: g.day_of_week,
        time_slot: g.time_slot,
        session_template_id: g.session_template_id ?? null,
        notes: g.notes ?? null,
      });
    }
  }

  // Athlete-only overrides (no matching group slot)
  for (const o of athleteOverrides) {
    const k = slotKey(o);
    if (seen.has(k)) continue;
    result.push({
      id: o.id,
      athlete_id: o.athlete_id,
      week_start: o.week_start,
      day_of_week: o.day_of_week,
      time_slot: o.time_slot,
      session_template_id: o.session_template_id ?? null,
      notes: o.notes ?? null,
      overridden: true,
      overrideId: o.id,
    });
  }

  return result;
}

export function mergeStrengthWeekMeta(
  groupMeta: StrengthPlanningWeekMeta | null,
  athleteOverride: StrengthPlanningWeekOverride | null,
): EffectiveStrengthWeekMeta {
  if (athleteOverride) {
    return {
      week_type: athleteOverride.week_type ?? null,
      notes: athleteOverride.notes ?? null,
      source: "athlete",
    };
  }
  if (groupMeta) {
    return {
      week_type: groupMeta.week_type ?? null,
      notes: groupMeta.notes ?? null,
      source: "group",
    };
  }
  return { week_type: null, notes: null, source: "none" };
}
