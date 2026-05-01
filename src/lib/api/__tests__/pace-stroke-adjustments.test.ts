import assert from "node:assert/strict";
import { describe, it, before, beforeEach } from "node:test";
import { mock } from "node:test";

let fromImpl: (...args: unknown[]) => unknown;
let getUserImpl: () => unknown;

before(async () => {
  const real = await import("../client.ts");
  mock.module("../client.ts", {
    namedExports: {
      ...real,
      canUseSupabase: () => true,
      supabase: {
        from: (...args: unknown[]) => fromImpl(...args),
        auth: { getUser: () => getUserImpl() },
      },
    },
  });
});

beforeEach(() => {
  fromImpl = () => { throw new Error("fromImpl not configured"); };
  getUserImpl = () => { throw new Error("getUserImpl not configured"); };
});

describe("pace-stroke-adjustments API", () => {
  it("getMyStrokeAdjustments returns [] when DB is empty", async () => {
    fromImpl = () => ({
      select: () => Promise.resolve({ data: [], error: null }),
    });
    const { getMyStrokeAdjustments } = await import("../pace-stroke-adjustments.ts");
    assert.deepEqual(await getMyStrokeAdjustments(), []);
  });

  it("upsertStrokeAdjustment calls .upsert with correct onConflict", async () => {
    getUserImpl = () => Promise.resolve({ data: { user: { id: "coach-uuid" } } });
    let capturedPayload: Record<string, unknown> | undefined;
    let capturedOpts: Record<string, unknown> | undefined;
    fromImpl = () => ({
      upsert: (payload: unknown, opts: unknown) => {
        capturedPayload = payload as Record<string, unknown>;
        capturedOpts = opts as Record<string, unknown>;
        return Promise.resolve({ error: null });
      },
    });
    const { upsertStrokeAdjustment } = await import("../pace-stroke-adjustments.ts");
    await upsertStrokeAdjustment({ stroke: "dos", event_family: "100m", m_value: 0.05 });
    assert.equal(capturedPayload?.coach_id, "coach-uuid");
    assert.equal(capturedPayload?.stroke, "dos");
    assert.equal(capturedPayload?.event_family, "100m");
    assert.equal(capturedPayload?.m_value, 0.05);
    assert.equal(capturedOpts?.onConflict, "coach_id,stroke,event_family");
  });

  it("resetMyStrokeAdjustments calls .delete().eq(coach_id)", async () => {
    getUserImpl = () => Promise.resolve({ data: { user: { id: "coach-uuid" } } });
    let deleteCalled = false;
    let eqArg: unknown;
    fromImpl = () => ({
      delete: () => ({
        eq: (col: unknown, val: unknown) => {
          deleteCalled = true;
          eqArg = val;
          return Promise.resolve({ error: null });
        },
      }),
    });
    const { resetMyStrokeAdjustments } = await import("../pace-stroke-adjustments.ts");
    await resetMyStrokeAdjustments();
    assert.ok(deleteCalled, "delete was called");
    assert.equal(eqArg, "coach-uuid");
  });

  it("getMyStrokeAdjustments returns rows from DB", async () => {
    const mockRows = [
      { coach_id: "coach-uuid", stroke: "dos", event_family: "50m", m_value: 0.08 },
    ];
    fromImpl = () => ({
      select: () => Promise.resolve({ data: mockRows, error: null }),
    });
    const { getMyStrokeAdjustments } = await import("../pace-stroke-adjustments.ts");
    const result = await getMyStrokeAdjustments();
    assert.equal(result.length, 1);
    assert.equal(result[0].stroke, "dos");
    assert.equal(result[0].m_value, 0.08);
  });
});
