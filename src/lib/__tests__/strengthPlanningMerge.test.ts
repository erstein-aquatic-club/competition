import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeStrengthSlots, mergeStrengthWeekMeta } from "@/lib/strengthPlanningMerge";
import type {
  StrengthPlanningSlot,
  StrengthPlanningSlotOverride,
  StrengthPlanningWeekMeta,
  StrengthPlanningWeekOverride,
} from "@/lib/api/types";

const baseSlot = (partial: Partial<StrengthPlanningSlot>): StrengthPlanningSlot => ({
  id: "g1",
  group_id: 1,
  week_start: "2026-05-04",
  day_of_week: 0,
  time_slot: "evening",
  session_template_id: null,
  notes: null,
  created_at: "2026-01-01T00:00:00Z",
  ...partial,
});

const baseOverride = (
  partial: Partial<StrengthPlanningSlotOverride>,
): StrengthPlanningSlotOverride => ({
  id: "o1",
  athlete_id: 1,
  week_start: "2026-05-04",
  day_of_week: 0,
  time_slot: "evening",
  session_template_id: 42,
  notes: null,
  created_at: "2026-01-01T00:00:00Z",
  ...partial,
});

describe("mergeStrengthSlots", () => {
  it("returns group slots unchanged when no overrides", () => {
    const groupSlots = [baseSlot({}), baseSlot({ id: "g2", day_of_week: 1 })];
    const result = mergeStrengthSlots(groupSlots, []);
    assert.equal(result.length, 2);
    assert.equal(result.every((s) => !s.overridden), true);
  });

  it("replaces group slot with matching override", () => {
    const groupSlots = [baseSlot({ session_template_id: 10 })];
    const overrides = [baseOverride({ session_template_id: 42 })];
    const result = mergeStrengthSlots(groupSlots, overrides);
    assert.equal(result.length, 1);
    assert.equal(result[0].session_template_id, 42);
    assert.equal(result[0].overridden, true);
    assert.equal(result[0].overrideId, "o1");
  });

  it("adds override-only slot (group has no slot on that day)", () => {
    const groupSlots: StrengthPlanningSlot[] = [];
    const overrides = [baseOverride({})];
    const result = mergeStrengthSlots(groupSlots, overrides);
    assert.equal(result.length, 1);
    assert.equal(result[0].overridden, true);
    assert.equal(result[0].athlete_id, 1);
  });

  it("keeps non-overridden group slots alongside overridden ones", () => {
    const groupSlots = [
      baseSlot({ id: "g1", day_of_week: 0, session_template_id: 10 }),
      baseSlot({ id: "g2", day_of_week: 1, session_template_id: 20 }),
    ];
    const overrides = [baseOverride({ day_of_week: 0, session_template_id: 99 })];
    const result = mergeStrengthSlots(groupSlots, overrides);
    const day0 = result.find((s) => s.day_of_week === 0);
    const day1 = result.find((s) => s.day_of_week === 1);
    assert.equal(day0?.overridden, true);
    assert.equal(day0?.session_template_id, 99);
    assert.ok(!day1?.overridden);
    assert.equal(day1?.session_template_id, 20);
  });

  it("uses override session_template_id null when override clears the session", () => {
    const groupSlots = [baseSlot({ session_template_id: 10 })];
    const overrides = [baseOverride({ session_template_id: null })];
    const result = mergeStrengthSlots(groupSlots, overrides);
    assert.equal(result[0].session_template_id, null);
    assert.equal(result[0].overridden, true);
  });

  it("preserves group slot notes when no override notes", () => {
    const groupSlots = [baseSlot({ notes: "Charge légère" })];
    const result = mergeStrengthSlots(groupSlots, []);
    assert.equal(result[0].notes, "Charge légère");
  });

  it("override notes take precedence over group notes", () => {
    const groupSlots = [baseSlot({ notes: "Charge légère" })];
    const overrides = [baseOverride({ notes: "Adapté pour blessure" })];
    const result = mergeStrengthSlots(groupSlots, overrides);
    assert.equal(result[0].notes, "Adapté pour blessure");
  });

  it("does not duplicate slots when override matches group key", () => {
    const groupSlots = [baseSlot({})];
    const overrides = [baseOverride({})];
    const result = mergeStrengthSlots(groupSlots, overrides);
    assert.equal(result.length, 1);
  });
});

describe("mergeStrengthWeekMeta", () => {
  const groupMeta: StrengthPlanningWeekMeta = {
    id: "gm1",
    group_id: 1,
    week_start: "2026-05-04",
    week_type: "force",
    notes: "Semaine groupe",
    updated_at: "2026-01-01T00:00:00Z",
  };
  const athleteOverride: StrengthPlanningWeekOverride = {
    id: "ao1",
    athlete_id: 1,
    week_start: "2026-05-04",
    week_type: "taper",
    notes: "Allègement personnel",
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("returns none when nothing is set", () => {
    const result = mergeStrengthWeekMeta(null, null);
    assert.deepEqual(result, { week_type: null, notes: null, source: "none" });
  });

  it("returns group meta when no athlete override", () => {
    const result = mergeStrengthWeekMeta(groupMeta, null);
    assert.deepEqual(result, {
      week_type: "force",
      notes: "Semaine groupe",
      source: "group",
    });
  });

  it("athlete override takes precedence over group", () => {
    const result = mergeStrengthWeekMeta(groupMeta, athleteOverride);
    assert.deepEqual(result, {
      week_type: "taper",
      notes: "Allègement personnel",
      source: "athlete",
    });
  });

  it("athlete override with null week_type still marks source=athlete", () => {
    const result = mergeStrengthWeekMeta(groupMeta, {
      ...athleteOverride,
      week_type: null,
      notes: null,
    });
    assert.equal(result.source, "athlete");
    assert.equal(result.week_type, null);
    assert.equal(result.notes, null);
  });

  it("athlete-only override (no group meta) works", () => {
    const result = mergeStrengthWeekMeta(null, athleteOverride);
    assert.equal(result.source, "athlete");
    assert.equal(result.week_type, "taper");
  });
});
