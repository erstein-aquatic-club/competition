import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { mock } from "node:test";
import type { ConsumeResult } from "../CoachPaceCalculatorScreen";

before(async () => {
  // @assets is a Vite-only alias — unavailable in node:test; mock the whole
  // PDF module so the transitive import of logo-eac.png never resolves.
  mock.module("@/lib/export-pace-pdf", {
    namedExports: { exportPacePdf: async () => new Blob() },
  });
});

describe("CoachPaceCalculatorScreen — selectAccordionTargetForPrefill", () => {
  const team = [
    { id: "account-42", kind: "account", accountId: 42, displayName: "Léo" },
    { id: "account-43", kind: "account", accountId: 43, displayName: "Sara" },
  ];
  const targets = [
    { id: "t1", swimmer_account_id: 42, stroke: "NL", target_distance_m: 100, target_pool_size: "50m" },
    { id: "t2", swimmer_account_id: 43, stroke: "Dos", target_distance_m: 200, target_pool_size: "25m" },
  ];

  it("returns 'open-existing' when a matching target already exists", async () => {
    const { selectAccordionTargetForPrefill } = await import("../CoachPaceCalculatorScreen");
    const r = selectAccordionTargetForPrefill({
      payload: { swimmer_account_id: 42, stroke: "NL", target_distance_m: 100, target_time_ms: 65500, target_pool_size: "50m" },
      team: team as unknown as Parameters<typeof selectAccordionTargetForPrefill>[0]["team"],
      targets: targets as unknown as Parameters<typeof selectAccordionTargetForPrefill>[0]["targets"],
    });
    const expected: ConsumeResult = { kind: "open-existing", swimmerAccordionId: "account-42", targetId: "t1" };
    assert.deepEqual(r, expected);
  });

  it("returns 'open-create' when swimmer found but no matching target", async () => {
    const { selectAccordionTargetForPrefill } = await import("../CoachPaceCalculatorScreen");
    const r = selectAccordionTargetForPrefill({
      payload: { swimmer_account_id: 42, stroke: "Brasse", target_distance_m: 50, target_time_ms: 32500, target_pool_size: "50m" },
      team: team as unknown as Parameters<typeof selectAccordionTargetForPrefill>[0]["team"],
      targets: targets as unknown as Parameters<typeof selectAccordionTargetForPrefill>[0]["targets"],
    });
    assert.equal(r.kind, "open-create");
    if (r.kind === "open-create") {
      assert.equal(r.swimmerAccordionId, "account-42");
      assert.equal(r.payload.stroke, "Brasse");
    }
  });

  it("returns 'unknown-swimmer' when account not in team", async () => {
    const { selectAccordionTargetForPrefill } = await import("../CoachPaceCalculatorScreen");
    const r = selectAccordionTargetForPrefill({
      payload: { swimmer_account_id: 999, stroke: "NL", target_distance_m: 100, target_time_ms: 65500, target_pool_size: "50m" },
      team: team as unknown as Parameters<typeof selectAccordionTargetForPrefill>[0]["team"],
      targets: targets as unknown as Parameters<typeof selectAccordionTargetForPrefill>[0]["targets"],
    });
    assert.equal(r.kind, "unknown-swimmer");
  });
});
