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
  fromImpl = () => { throw new Error("fromImpl not configured for this test"); };
  getUserImpl = () => { throw new Error("getUserImpl not configured for this test"); };
});

describe("pace-zones API", () => {
  it("returns DEFAULT_ZONES when no row exists", async () => {
    fromImpl = () => ({
      select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
    });
    const { getMyPaceZones } = await import("../pace-zones.ts");
    const { DEFAULT_ZONES } = await import("../../paceCalculator.ts");
    assert.deepEqual(await getMyPaceZones(), DEFAULT_ZONES);
  });

  it("returns the persisted row when present", async () => {
    const row = { v0_pct: 145, v1_pct: 132, v2_pct: 116, v3_pct: 111, max_pct: 106 };
    fromImpl = () => ({
      select: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }),
    });
    const { getMyPaceZones } = await import("../pace-zones.ts");
    assert.deepEqual(await getMyPaceZones(), row);
  });

  it("upsertMyPaceZones calls supabase upsert with coach_id and onConflict", async () => {
    getUserImpl = () => Promise.resolve({ data: { user: { id: "coach-uuid" } } });
    let capturedRow: Record<string, unknown> | undefined;
    let capturedOpts: Record<string, unknown> | undefined;
    fromImpl = () => ({
      upsert: (row: unknown, opts: unknown) => {
        capturedRow = row as Record<string, unknown>;
        capturedOpts = opts as Record<string, unknown>;
        return { select: () => ({ single: () => Promise.resolve({ data: {}, error: null }) }) };
      },
    });
    const { upsertMyPaceZones } = await import("../pace-zones.ts");
    await upsertMyPaceZones({ v0_pct: 140, v1_pct: 130, v2_pct: 115, v3_pct: 110, max_pct: 105 });
    assert.equal(capturedRow?.coach_id, "coach-uuid");
    assert.equal(capturedRow?.v0_pct, 140);
    assert.equal(capturedOpts?.onConflict, "coach_id");
  });
});
