import assert from "node:assert/strict";
import { describe, it, before, beforeEach } from "node:test";
import { mock } from "node:test";

let fromImpl: (...args: unknown[]) => unknown;

before(async () => {
  const real = await import("../client.ts");
  mock.module("../client.ts", {
    namedExports: {
      ...real,
      canUseSupabase: () => true,
      supabase: {
        from: (...args: unknown[]) => fromImpl(...args),
      },
    },
  });
});

beforeEach(() => {
  fromImpl = () => {
    throw new Error("fromImpl not configured");
  };
});

describe("training-plans API (§275.2)", () => {
  it("isMondayIso accepts only Mondays via applyTrainingPlan input check", async () => {
    // 2026-03-23 is a Monday → should not throw the Monday check
    // 2026-03-24 is a Tuesday → should throw
    fromImpl = () => ({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({
            data: { id: 1, plan_id: 1, target_user_id: 1, start_date: "2026-03-23" },
            error: null,
          }),
        }),
      }),
    });
    const { applyTrainingPlan } = await import("../training-plans.ts");

    await assert.rejects(
      () => applyTrainingPlan(
        { plan_id: 1, target_user_id: 1, start_date: "2026-03-24" },
        2,
      ),
      /lundi/i,
    );

    // Monday accepted
    const ok = await applyTrainingPlan(
      { plan_id: 1, target_user_id: 1, start_date: "2026-03-23" },
      2,
    );
    assert.equal(ok.start_date, "2026-03-23");
  });

  it("applyTrainingPlan rejects XOR violation (both targets)", async () => {
    const { applyTrainingPlan } = await import("../training-plans.ts");
    await assert.rejects(
      () => applyTrainingPlan(
        { plan_id: 1, target_user_id: 1, target_group_id: 2, start_date: "2026-03-23" },
        2,
      ),
      /target_user_id.*target_group_id/i,
    );
  });

  it("applyTrainingPlan rejects XOR violation (no target)", async () => {
    const { applyTrainingPlan } = await import("../training-plans.ts");
    await assert.rejects(
      () => applyTrainingPlan(
        { plan_id: 1, start_date: "2026-03-23" },
        2,
      ),
      /target_user_id.*target_group_id/i,
    );
  });

  it("getTrainingPlans applies discipline + draft filters", async () => {
    let capturedFilters: Record<string, unknown> = {};
    const chain = {
      select: () => chain,
      order: () => chain,
      eq: (col: string, val: unknown) => {
        capturedFilters[col] = val;
        return chain;
      },
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: [], error: null }),
    };
    fromImpl = () => chain;
    const { getTrainingPlans } = await import("../training-plans.ts");
    await getTrainingPlans({ ownerId: 2, discipline: "strength", includeDrafts: false });
    assert.deepEqual(capturedFilters, {
      owner_id: 2,
      discipline: "strength",
      is_draft: false,
    });
  });
});
