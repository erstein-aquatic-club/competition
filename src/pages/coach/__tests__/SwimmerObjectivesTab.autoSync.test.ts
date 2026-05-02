import assert from "node:assert/strict";
import { describe, it, before, mock } from "node:test";

let upsertCalled: unknown[] = [];
let invalidateCalled: unknown[] = [];

before(async () => {
  mock.module("@/lib/api/pace-targets", {
    namedExports: {
      upsertPaceTarget: async (args: unknown) => { upsertCalled.push(args); return {}; },
      listMyPaceTargets: async () => [],
      deletePaceTarget: async () => {},
    },
  });
});

describe("autoSyncPaceTarget", () => {
  it("calls upsertPaceTarget when objective has parseable chrono target", async () => {
    upsertCalled = [];
    const { autoSyncPaceTarget } = await import("../SwimmerObjectivesTab");
    const fakeQC = { invalidateQueries: (args: unknown) => { invalidateCalled.push(args); } };
    await autoSyncPaceTarget(
      { event_code: "100NL", pool_length: 50, target_time_seconds: 65 },
      7,
      fakeQC as any,
    );
    assert.equal(upsertCalled.length, 1);
    const arg = upsertCalled[0] as any;
    assert.deepEqual(arg.swimmer, { kind: "account", accountId: 7 });
    assert.equal(arg.stroke, "NL");
    assert.equal(arg.target_distance_m, 100);
    assert.equal(arg.target_time_ms, 65_000);
    assert.equal(arg.target_pool_size, "50m");
  });

  it("does not call upsertPaceTarget when event_code is not parseable", async () => {
    upsertCalled = [];
    const { autoSyncPaceTarget } = await import("../SwimmerObjectivesTab");
    const fakeQC = { invalidateQueries: () => {} };
    await autoSyncPaceTarget(
      { event_code: null, pool_length: null, target_time_seconds: 65 },
      7,
      fakeQC as any,
    );
    assert.equal(upsertCalled.length, 0);
  });

  it("does not call upsertPaceTarget when target_time_seconds is null", async () => {
    upsertCalled = [];
    const { autoSyncPaceTarget } = await import("../SwimmerObjectivesTab");
    const fakeQC = { invalidateQueries: () => {} };
    await autoSyncPaceTarget(
      { event_code: "100NL", pool_length: 50, target_time_seconds: null },
      7,
      fakeQC as any,
    );
    assert.equal(upsertCalled.length, 0);
  });
});
