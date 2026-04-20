import assert from "node:assert/strict";
import { describe, it, before, beforeEach, mock } from "node:test";

/**
 * Tests for the atomic strength-set write path (§ "Issue #3").
 *
 * We mock `../api/client.ts` the same way bulkCreateSlotAssignments.test.ts
 * does, so that `logStrengthSet` and `reconcileStrengthRunLogs` take the
 * Supabase branch and we can observe the calls.
 */

type RpcCall = { name: string; args: Record<string, unknown> };
type RpcHandler = (
  name: string,
  args: Record<string, unknown>,
) => { data: unknown; error: unknown };
type SelectCountHandler = () => { count: number | null; error: unknown };

const rpcCalls: RpcCall[] = [];
let rpcHandler: RpcHandler = () => ({
  data: { set_id: 1, one_rm_updated: false, one_rm: null },
  error: null,
});
let selectCountHandler: SelectCountHandler = () => ({
  count: 0,
  error: null,
});

before(async () => {
  const real = await import("../api/client.ts");

  const supabaseStub = {
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve(rpcHandler(name, args));
    },
    from: (_table: string) => {
      const chain: Record<string, unknown> = {
        select: (_cols?: string, _opts?: unknown) => chain,
        insert: () => Promise.resolve({ error: null }),
        eq: () => Promise.resolve(selectCountHandler()),
        update: () => chain,
      };
      return chain;
    },
  };

  mock.module("../api/client.ts", {
    namedExports: {
      ...real,
      canUseSupabase: () => true,
      supabase: supabaseStub,
    },
  });
});

describe("logStrengthSet — atomic RPC path", () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    rpcHandler = () => ({
      data: { set_id: 1, one_rm_updated: false, one_rm: null },
      error: null,
    });
    selectCountHandler = () => ({ count: 0, error: null });
  });

  it("calls log_strength_set_atomic once with expected args", async () => {
    const { logStrengthSet } = await import("../api/strength.ts");
    await logStrengthSet({
      run_id: 42,
      exercise_id: 7,
      set_index: 2,
      reps: 5,
      weight: 80,
      athlete_id: 11,
    });
    assert.equal(rpcCalls.length, 1);
    const call = rpcCalls[0];
    assert.equal(call.name, "log_strength_set_atomic");
    assert.equal(call.args.p_user_id, 11);
    assert.equal(call.args.p_exercise_id, 7);
    assert.equal(call.args.p_reps, 5);
    assert.equal(call.args.p_weight, 80);
    assert.equal(call.args.p_run_id, 42);
    assert.equal(call.args.p_set_index, 2);
    // Epley 5 reps at 80kg => 80 * (1 + 5/30) ≈ 93.33 rounded to 93
    assert.equal(call.args.p_one_rm_estimate, 93);
    assert.equal(typeof call.args.p_completed_at, "string");
  });

  it("passes null 1RM estimate for bodyweight sets", async () => {
    const { logStrengthSet } = await import("../api/strength.ts");
    await logStrengthSet({
      run_id: 1,
      exercise_id: 2,
      set_index: 1,
      reps: 10,
      weight: -1, // BODYWEIGHT_SENTINEL
      athlete_id: 5,
    });
    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0].args.p_one_rm_estimate, null);
  });

  it("throws when the RPC returns an error (no silent swallow)", async () => {
    rpcHandler = () => ({ data: null, error: { message: "boom" } });
    const { logStrengthSet } = await import("../api/strength.ts");
    await assert.rejects(
      () =>
        logStrengthSet({
          run_id: 1,
          exercise_id: 2,
          reps: 3,
          weight: 50,
          athlete_id: 5,
        }),
      /boom/,
    );
  });

  it("surfaces one_rm_updated=true when the RPC confirms a new PR", async () => {
    rpcHandler = () => ({
      data: { set_id: 999, one_rm_updated: true, one_rm: 120 },
      error: null,
    });
    const { logStrengthSet } = await import("../api/strength.ts");
    const res = await logStrengthSet({
      run_id: 1,
      exercise_id: 2,
      reps: 1,
      weight: 120,
      athlete_id: 5,
    });
    assert.equal(res.one_rm_updated, true);
    assert.equal(res.one_rm, 120);
  });
});

describe("reconcileStrengthRunLogs — resilient loop", () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    rpcHandler = () => ({
      data: { set_id: 1, one_rm_updated: false, one_rm: null },
      error: null,
    });
    selectCountHandler = () => ({ count: 0, error: null });
  });

  it("continues past a single-set error and aggregates errors", async () => {
    // Remote count returns 0 — so all 3 local logs are missing.
    selectCountHandler = () => ({ count: 0, error: null });
    let call = 0;
    rpcHandler = () => {
      call += 1;
      if (call === 2) return { data: null, error: { message: "rls denied" } };
      return {
        data: { set_id: call, one_rm_updated: false, one_rm: null },
        error: null,
      };
    };

    const { reconcileStrengthRunLogs } = await import("../api/strength.ts");
    const result = await reconcileStrengthRunLogs({
      runId: 10,
      logs: [
        { exercise_id: 100, reps: 5, weight: 50 },
        { exercise_id: 101, reps: 5, weight: 60 },
        { exercise_id: 102, reps: 5, weight: 70 },
      ],
      athleteId: 5,
    });

    assert.equal(result.attempted, 3);
    assert.equal(result.succeeded, 2);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].exercise_id, 101);
    assert.match(result.errors[0].message, /rls denied/);
    // All 3 RPCs were attempted (loop did not abort on the 2nd failure).
    assert.equal(rpcCalls.length, 3);
  });

  it("throws when the initial count query fails (was silently returning)", async () => {
    selectCountHandler = () => ({
      count: null,
      error: { message: "boom" },
    });
    const { reconcileStrengthRunLogs } = await import("../api/strength.ts");
    await assert.rejects(
      () =>
        reconcileStrengthRunLogs({
          runId: 10,
          logs: [{ exercise_id: 100, reps: 5, weight: 50 }],
          athleteId: 5,
        }),
      /boom/,
    );
  });

  it("returns an empty result when logs array is empty", async () => {
    const { reconcileStrengthRunLogs } = await import("../api/strength.ts");
    const result = await reconcileStrengthRunLogs({
      runId: 10,
      logs: [],
      athleteId: 5,
    });
    assert.deepEqual(result, { attempted: 0, succeeded: 0, errors: [] });
    assert.equal(rpcCalls.length, 0);
  });
});
