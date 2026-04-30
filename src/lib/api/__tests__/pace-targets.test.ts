import assert from "node:assert/strict";
import { describe, it, before, beforeEach } from "node:test";
import { mock } from "node:test";
import type { PaceTarget, SwimmerRef } from "../pace-targets.ts";

let fromImpl: (...args: unknown[]) => unknown;
let getUserImpl: () => unknown;

const mockTarget = (overrides: Partial<PaceTarget> = {}): PaceTarget => ({
  id: "t1",
  coach_id: "coach-uuid",
  swimmer_account_id: 42,
  swimmer_manual_id: null,
  stroke: "NL",
  target_distance_m: 100,
  target_time_ms: 65_000,
  updated_at: "2026-04-30T00:00:00Z",
  ...overrides,
});

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

describe("pace-targets API", () => {
  describe("listMyPaceTargets", () => {
    it("returns targets ordered by updated_at desc", async () => {
      const rows = [
        mockTarget({ id: "t1", updated_at: "2026-04-30T10:00:00Z" }),
        mockTarget({ id: "t2", updated_at: "2026-04-28T10:00:00Z" }),
      ];
      fromImpl = () => ({
        select: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }),
      });
      const { listMyPaceTargets } = await import("../pace-targets.ts");
      const result = await listMyPaceTargets();
      assert.equal(result.length, 2);
      assert.equal(result[0].id, "t1");
    });

    it("throws on supabase error", async () => {
      fromImpl = () => ({
        select: () => ({
          order: () => Promise.resolve({ data: null, error: { message: "DB error" } }),
        }),
      });
      const { listMyPaceTargets } = await import("../pace-targets.ts");
      await assert.rejects(() => listMyPaceTargets(), /DB error/);
    });
  });

  describe("upsertPaceTarget — account swimmer", () => {
    it("calls upsert with onConflict uq_pace_targets_account", async () => {
      getUserImpl = () => Promise.resolve({ data: { user: { id: "coach-uuid" } } });
      let capturedRow: Record<string, unknown> | undefined;
      let capturedOpts: Record<string, unknown> | undefined;
      fromImpl = () => ({
        upsert: (row: unknown, opts: unknown) => {
          capturedRow = row as Record<string, unknown>;
          capturedOpts = opts as Record<string, unknown>;
          return { select: () => ({ single: () => Promise.resolve({ data: mockTarget(), error: null }) }) };
        },
      });
      const { upsertPaceTarget } = await import("../pace-targets.ts");
      const swimmer: SwimmerRef = { kind: "account", accountId: 42 };
      await upsertPaceTarget({ swimmer, stroke: "NL", target_distance_m: 100, target_time_ms: 65_000 });
      assert.equal(capturedRow?.coach_id, "coach-uuid");
      assert.equal(capturedRow?.swimmer_account_id, 42);
      assert.equal(capturedRow?.swimmer_manual_id, null);
      assert.equal(capturedOpts?.onConflict, "uq_pace_targets_account");
    });
  });

  describe("upsertPaceTarget — manual swimmer", () => {
    it("calls upsert with onConflict uq_pace_targets_manual", async () => {
      getUserImpl = () => Promise.resolve({ data: { user: { id: "coach-uuid" } } });
      let capturedRow: Record<string, unknown> | undefined;
      let capturedOpts: Record<string, unknown> | undefined;
      fromImpl = () => ({
        upsert: (row: unknown, opts: unknown) => {
          capturedRow = row as Record<string, unknown>;
          capturedOpts = opts as Record<string, unknown>;
          return {
            select: () => ({
              single: () => Promise.resolve({
                data: mockTarget({ swimmer_account_id: null, swimmer_manual_id: "manual-uuid" }),
                error: null,
              }),
            }),
          };
        },
      });
      const { upsertPaceTarget } = await import("../pace-targets.ts");
      const swimmer: SwimmerRef = { kind: "manual", manualId: "manual-uuid" };
      await upsertPaceTarget({ swimmer, stroke: "NL", target_distance_m: 100, target_time_ms: 65_000 });
      assert.equal(capturedRow?.swimmer_manual_id, "manual-uuid");
      assert.equal(capturedRow?.swimmer_account_id, null);
      assert.equal(capturedOpts?.onConflict, "uq_pace_targets_manual");
    });
  });

  describe("deletePaceTarget", () => {
    it("calls delete with correct id filter", async () => {
      let capturedField: unknown;
      let capturedValue: unknown;
      fromImpl = () => ({
        delete: () => ({
          eq: (field: unknown, value: unknown) => {
            capturedField = field;
            capturedValue = value;
            return Promise.resolve({ error: null });
          },
        }),
      });
      const { deletePaceTarget } = await import("../pace-targets.ts");
      await deletePaceTarget("t1");
      assert.equal(capturedField, "id");
      assert.equal(capturedValue, "t1");
    });
  });
});
