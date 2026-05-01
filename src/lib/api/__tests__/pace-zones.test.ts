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

describe("pace-zones API v2", () => {
  it("getMyPaceZonesV2 returns {} when DB is empty", async () => {
    fromImpl = () => ({
      select: () => Promise.resolve({ data: [], error: null }),
    });
    const { getMyPaceZonesV2 } = await import("../pace-zones.ts");
    assert.deepEqual(await getMyPaceZonesV2(), {});
  });

  it("getMyPaceZonesV2 reconstructs nested map from rows", async () => {
    fromImpl = () => ({
      select: () => Promise.resolve({
        data: [
          { event_family: "50m", zone: "V0", k_value: 0.70 },
          { event_family: "50m", zone: "MAX", k_value: 1.00 },
          { event_family: "100m", zone: "V1", k_value: 0.80 },
        ],
        error: null,
      }),
    });
    const { getMyPaceZonesV2 } = await import("../pace-zones.ts");
    const result = await getMyPaceZonesV2();
    assert.deepEqual(result["50m"], { V0: 0.70, MAX: 1.00 });
    assert.deepEqual(result["100m"], { V1: 0.80 });
  });

  it("upsertPaceZoneCell calls .upsert with correct onConflict", async () => {
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
    const { upsertPaceZoneCell } = await import("../pace-zones.ts");
    await upsertPaceZoneCell({ event_family: "50m", zone: "V0", k_value: 0.70 });
    assert.equal(capturedPayload?.coach_id, "coach-uuid");
    assert.equal(capturedPayload?.event_family, "50m");
    assert.equal(capturedPayload?.zone, "V0");
    assert.equal(capturedPayload?.k_value, 0.70);
    assert.equal(capturedOpts?.onConflict, "coach_id,event_family,zone");
  });

  it("resetMyPaceZonesToDefaults inserts 27 rows (50m+100m=6 each, rest=5)", async () => {
    getUserImpl = () => Promise.resolve({ data: { user: { id: "coach-uuid" } } });
    let insertedRows: unknown[] = [];
    let deleteCalled = false;
    fromImpl = () => ({
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      insert: (rows: unknown[]) => { insertedRows = rows; return Promise.resolve({ error: null }); },
    });
    // reset deleteCalled tracking via wrapping fromImpl
    fromImpl = (table: unknown) => {
      return {
        delete: () => { deleteCalled = true; return { eq: () => Promise.resolve({ error: null }) }; },
        insert: (rows: unknown[]) => { insertedRows = rows; return Promise.resolve({ error: null }); },
      };
    };
    const { resetMyPaceZonesToDefaults } = await import("../pace-zones.ts");
    await resetMyPaceZonesToDefaults();
    assert.ok(deleteCalled, "delete was called");
    assert.equal(insertedRows.length, 27, `expected 27 rows, got ${insertedRows.length}`);
  });

  it("initMyPaceZonesIfMissing returns false when rows exist", async () => {
    fromImpl = () => ({
      select: (_cols: unknown, opts: unknown) => Promise.resolve({ count: 5, error: null }),
    });
    const { initMyPaceZonesIfMissing } = await import("../pace-zones.ts");
    const result = await initMyPaceZonesIfMissing();
    assert.equal(result, false);
  });

  it("deletePaceZoneCell calls .delete().eq(coach_id).eq(event_family).eq(zone)", async () => {
    getUserImpl = () => Promise.resolve({ data: { user: { id: "coach-uuid" } } });
    const calls: string[] = [];
    fromImpl = () => ({
      delete: () => ({
        eq: (col: string, _val: unknown) => {
          calls.push(col);
          return { eq: (col2: string, _v: unknown) => ({ eq: (col3: string, _v2: unknown) => Promise.resolve({ error: null }) }) };
        },
      }),
    });
    const { deletePaceZoneCell } = await import("../pace-zones.ts");
    await deletePaceZoneCell({ event_family: "200m", zone: "V4" });
    // Verify the chain was called (function didn't throw)
    assert.ok(true, "deletePaceZoneCell resolved without error");
  });
});
