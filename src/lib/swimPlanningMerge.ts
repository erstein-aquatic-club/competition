import type {
  SwimPlanningSlot,
  SwimPlanningSlotOverride,
  SwimPlanningWeekMeta,
  SwimPlanningWeekOverride,
} from "@/lib/api/types";

export interface EffectiveSlot {
  id: string;
  group_id?: number;
  athlete_id?: number;
  week_start: string;
  day_of_week: number;
  time_slot: "morning" | "evening";
  filiere: string;
  session_id?: string | null;
  overridden?: boolean;
  overrideId?: string;
}

export interface EffectiveWeekMeta {
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

export function mergeSlots(
  groupSlots: SwimPlanningSlot[],
  athleteOverrides: SwimPlanningSlotOverride[],
): EffectiveSlot[] {
  const overrideMap = new Map<string, SwimPlanningSlotOverride>();
  for (const o of athleteOverrides) overrideMap.set(slotKey(o), o);

  const result: EffectiveSlot[] = [];
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
        filiere: ov.filiere,
        session_id: ov.session_id ?? null,
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
        filiere: g.filiere,
        session_id: g.session_id ?? null,
      });
    }
  }

  for (const o of athleteOverrides) {
    const k = slotKey(o);
    if (seen.has(k)) continue;
    result.push({
      id: o.id,
      athlete_id: o.athlete_id,
      week_start: o.week_start,
      day_of_week: o.day_of_week,
      time_slot: o.time_slot,
      filiere: o.filiere,
      session_id: o.session_id ?? null,
      overridden: true,
      overrideId: o.id,
    });
  }

  return result;
}

export function mergeWeekMeta(
  groupMeta: SwimPlanningWeekMeta | null,
  athleteOverride: SwimPlanningWeekOverride | null,
): EffectiveWeekMeta {
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
