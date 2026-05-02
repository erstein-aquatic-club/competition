import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findMatchingTarget } from "../useTargetForObjective";

const targets = [
  { id: "t1", swimmer_account_id: 42, stroke: "NL", target_distance_m: 100, target_pool_size: "50m", updated_at: "2026-04-01" } as const,
  { id: "t2", swimmer_account_id: 42, stroke: "NL", target_distance_m: 100, target_pool_size: "50m", updated_at: "2026-05-01" } as const,
  { id: "t3", swimmer_account_id: 42, stroke: "Dos", target_distance_m: 100, target_pool_size: "50m", updated_at: "2026-04-15" } as const,
  { id: "t4", swimmer_account_id: 99, stroke: "NL", target_distance_m: 100, target_pool_size: "50m", updated_at: "2026-04-01" } as const,
];

describe("useTargetForObjective — findMatchingTarget", () => {
  it("returns the most recent (updated_at desc) when multiple match", () => {
    const r = findMatchingTarget(targets, 42, { stroke: "NL", distance: 100, pool_size: "50m" });
    assert.equal(r?.id, "t2");
  });
  it("returns null when no row matches the swimmer", () => {
    const r = findMatchingTarget(targets, 5, { stroke: "NL", distance: 100, pool_size: "50m" });
    assert.equal(r, null);
  });
  it("returns null when stroke doesn't match", () => {
    const r = findMatchingTarget(targets, 42, { stroke: "Brasse", distance: 100, pool_size: "50m" });
    assert.equal(r, null);
  });
  it("returns null when pool_size differs", () => {
    const r = findMatchingTarget(targets, 42, { stroke: "NL", distance: 100, pool_size: "25m" });
    assert.equal(r, null);
  });
  it("returns null on null parsed input", () => {
    const r = findMatchingTarget(targets, 42, null);
    assert.equal(r, null);
  });
});
