import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isStrengthPlanQueryKey,
  STRENGTH_PLAN_QUERY_PREFIXES,
} from "../strengthPlanFreshness";

describe("PWA strength plan freshness", () => {
  it("excludes every plan query prefix from the persisted PWA snapshot", () => {
    for (const prefix of STRENGTH_PLAN_QUERY_PREFIXES) {
      assert.equal(isStrengthPlanQueryKey([prefix, 1, ["2026-11-09"]]), true, prefix);
    }
  });

  it("covers the two legacy variants of dated slot/week queries", () => {
    for (const prefix of [
      "strength_planning_slot_overrides",
      "strength-planning-slot-overrides",
      "strength_planning_week_overrides",
      "strength-planning-week-overrides",
      "strength_planning_slots",
      "strength-planning-slots",
    ]) {
      assert.equal(isStrengthPlanQueryKey([prefix, 1]), true);
    }
  });

  it("includes session content and plan application queries", () => {
    for (const prefix of [
      "strength-mesocycle-active",
      "strength_catalog",
      "training_plan_applications",
      "training_plan_sessions",
      "strength_folders",
    ]) {
      assert.equal(isStrengthPlanQueryKey([prefix]), true);
    }
  });

  it("does not disable PWA offline caching for unrelated data", () => {
    for (const query of [["groups"], ["profile", 1], ["swim_results"], []]) {
      assert.equal(isStrengthPlanQueryKey(query), false);
    }
    assert.equal(isStrengthPlanQueryKey([null]), false);
  });
});
