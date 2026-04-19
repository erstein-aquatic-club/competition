import { describe, it, expect } from "vitest";
import { mergeSlots, mergeWeekMeta } from "@/lib/swimPlanningMerge";
import type {
  SwimPlanningSlot,
  SwimPlanningSlotOverride,
  SwimPlanningWeekMeta,
  SwimPlanningWeekOverride,
} from "@/lib/api/types";

const baseSlot = (partial: Partial<SwimPlanningSlot>): SwimPlanningSlot => ({
  id: "g1",
  group_id: 1,
  week_start: "2026-05-04",
  day_of_week: 0,
  time_slot: "morning",
  filiere: "Aerobie",
  session_id: null,
  ...partial,
});

const baseOverride = (
  partial: Partial<SwimPlanningSlotOverride>,
): SwimPlanningSlotOverride => ({
  id: "o1",
  athlete_id: 1,
  week_start: "2026-05-04",
  day_of_week: 0,
  time_slot: "morning",
  filiere: "VMA",
  session_id: null,
  ...partial,
});

describe("mergeSlots", () => {
  it("returns group slots unchanged when no overrides", () => {
    const groupSlots = [baseSlot({}), baseSlot({ id: "g2", day_of_week: 1 })];
    const result = mergeSlots(groupSlots, []);
    expect(result).toHaveLength(2);
    expect(result.every((s) => !s.overridden)).toBe(true);
  });

  it("replaces group slot with matching override", () => {
    const groupSlots = [baseSlot({})];
    const overrides = [baseOverride({})];
    const result = mergeSlots(groupSlots, overrides);
    expect(result).toHaveLength(1);
    expect(result[0].filiere).toBe("VMA");
    expect(result[0].overridden).toBe(true);
    expect(result[0].overrideId).toBe("o1");
  });

  it("adds override-only slot (group has no slot on that day)", () => {
    const groupSlots: SwimPlanningSlot[] = [];
    const overrides = [baseOverride({})];
    const result = mergeSlots(groupSlots, overrides);
    expect(result).toHaveLength(1);
    expect(result[0].overridden).toBe(true);
  });

  it("keeps non-overridden group slots alongside overridden ones", () => {
    const groupSlots = [
      baseSlot({ id: "g1", day_of_week: 0 }),
      baseSlot({ id: "g2", day_of_week: 1 }),
    ];
    const overrides = [baseOverride({ day_of_week: 0 })];
    const result = mergeSlots(groupSlots, overrides);
    const day0 = result.find((s) => s.day_of_week === 0);
    const day1 = result.find((s) => s.day_of_week === 1);
    expect(day0?.overridden).toBe(true);
    expect(day1?.overridden).toBeFalsy();
  });

  it("uses override session_id when provided", () => {
    const groupSlots = [baseSlot({ session_id: "sess-group" })];
    const overrides = [baseOverride({ session_id: "sess-custom" })];
    const result = mergeSlots(groupSlots, overrides);
    expect(result[0].session_id).toBe("sess-custom");
  });
});

describe("mergeWeekMeta", () => {
  const groupMeta: SwimPlanningWeekMeta = {
    id: "gm1",
    group_id: 1,
    week_start: "2026-05-04",
    week_type: "Prepa",
    notes: "Groupe notes",
  };
  const athleteOverride: SwimPlanningWeekOverride = {
    id: "ao1",
    athlete_id: 1,
    week_start: "2026-05-04",
    week_type: "Intensif",
    notes: "Personnel",
  };

  it("returns none when nothing is set", () => {
    const result = mergeWeekMeta(null, null);
    expect(result).toEqual({ week_type: null, notes: null, source: "none" });
  });

  it("returns group meta when no athlete override", () => {
    const result = mergeWeekMeta(groupMeta, null);
    expect(result).toEqual({
      week_type: "Prepa",
      notes: "Groupe notes",
      source: "group",
    });
  });

  it("athlete override takes precedence over group", () => {
    const result = mergeWeekMeta(groupMeta, athleteOverride);
    expect(result).toEqual({
      week_type: "Intensif",
      notes: "Personnel",
      source: "athlete",
    });
  });

  it("athlete override with null week_type still marks source=athlete", () => {
    const result = mergeWeekMeta(groupMeta, {
      ...athleteOverride,
      week_type: null,
      notes: null,
    });
    expect(result.source).toBe("athlete");
    expect(result.week_type).toBeNull();
  });
});
