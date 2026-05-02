import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldRenderInlineMatrix } from "../SwimmerObjectivesView";

describe("SwimmerObjectivesView — shouldRenderInlineMatrix", () => {
  it("returns true when objective has parseable code + target_time + accountId + matching target", () => {
    const r = shouldRenderInlineMatrix({
      objective: { event_code: "100NL", pool_length: 50, target_time_seconds: 65.5, athlete_id: "u" } as any,
      swimmerAccountId: 42,
      matchingTarget: { id: "t1", target_pool_size: "50m" } as any,
    });
    assert.equal(r, true);
  });
  it("returns false when target_time_seconds is null", () => {
    const r = shouldRenderInlineMatrix({
      objective: { event_code: "100NL", pool_length: 50, target_time_seconds: null, athlete_id: "u" } as any,
      swimmerAccountId: 42,
      matchingTarget: { id: "t1" } as any,
    });
    assert.equal(r, false);
  });
  it("returns false when no matching target", () => {
    const r = shouldRenderInlineMatrix({
      objective: { event_code: "100NL", pool_length: 50, target_time_seconds: 65.5, athlete_id: "u" } as any,
      swimmerAccountId: 42,
      matchingTarget: null,
    });
    assert.equal(r, false);
  });
  it("returns false when accountId is null (manual swimmer — N/A)", () => {
    const r = shouldRenderInlineMatrix({
      objective: { event_code: "100NL", pool_length: 50, target_time_seconds: 65.5, athlete_id: "u" } as any,
      swimmerAccountId: null,
      matchingTarget: { id: "t1" } as any,
    });
    assert.equal(r, false);
  });
});
