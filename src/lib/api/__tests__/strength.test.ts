import assert from "node:assert/strict";
import { describe, it, before, beforeEach, mock } from "node:test";

/**
 * Regression tests for §159 — the "séance muscu jamais marquée completed"
 * bug. Before §159, `updateStrengthRun` ran the run-status update and the
 * follow-up `session_assignments` update without inspecting the second
 * call's error: a coach-side RLS rejection or a transient 5xx silently
 * left the assignment as `in_progress` while the run itself flipped to
 * `completed`. Swimmers saw "in progress" forever on the calendar.
 *
 * The fix throws on the 2nd update's error. These tests pin that
 * contract: success path + assignment-update failure path.
 *
 * The test scaffolding mirrors `bulkCreateSlotAssignments.test.ts`'s
 * mock.module pattern — each `from()` call consumes one entry from the
 * `scripts` array in FIFO order.
 */

type ChainScript = {
  expect?: string;
  result: { data: unknown; error: null | { message: string; code?: string } };
};

const scripts: ChainScript[] = [];
const fromCalls: string[] = [];
const updatedPayloads: unknown[] = [];
// Per-test control of supabase.rpc() return: each entry consumed in FIFO.
// `args` captured so tests can assert which RPC was called and with what
// payload — important for §172/§174 atomic RPC contracts.
type RpcCall = { name: string; args: unknown };
const rpcCalls: RpcCall[] = [];
const rpcResults: { data: unknown; error: null | { message: string } }[] = [];

before(async () => {
  const real = await import("../client.ts");

  function makeChain(script: ChainScript) {
    const result = script.result;
    const thenable = {
      then: (resolve: (v: unknown) => void) => resolve(result),
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: () => chain,
      update: (rows: unknown) => {
        updatedPayloads.push(rows);
        return chain;
      },
      eq: () => chain,
      in: () => chain,
      is: () => chain,
      not: () => chain,
      order: () => chain,
      delete: () => chain,
      limit: () => chain,
      single: () => chain,
      maybeSingle: () => chain,
      then: thenable.then,
    };
    return chain;
  }

  mock.module("../client.ts", {
    namedExports: {
      ...real,
      canUseSupabase: () => true,
      supabase: {
        from: (table: string) => {
          fromCalls.push(table);
          const script = scripts.shift();
          if (!script) {
            throw new Error(`Unexpected supabase.from("${table}") — script empty`);
          }
          if (script.expect && script.expect !== table) {
            throw new Error(
              `Expected supabase.from("${script.expect}") but got "${table}"`,
            );
          }
          return makeChain(script);
        },
        rpc: (name: string, args: unknown) => {
          rpcCalls.push({ name, args });
          const next = rpcResults.shift() ?? { data: null, error: null };
          return { then: (r: (v: unknown) => void) => r(next) };
        },
      },
    },
  });
});

describe("updateStrengthRun — §159 regression", () => {
  beforeEach(() => {
    scripts.length = 0;
    fromCalls.length = 0;
    updatedPayloads.length = 0;
  });

  it("throws when the 2nd update (session_assignments) fails", async () => {
    // Script: [run update OK] → [assignment update FAILS]
    // Before §159 the second error was swallowed; the swimmer's calendar
    // showed the muscu slot stuck on "in_progress" until manual reset.
    scripts.push(
      { expect: "strength_session_runs", result: { data: null, error: null } },
      {
        expect: "session_assignments",
        result: { data: null, error: { message: "RLS denied", code: "42501" } },
      },
    );

    const { updateStrengthRun } = await import("../strength.ts");

    await assert.rejects(
      () => updateStrengthRun({
        run_id: 1,
        status: "completed",
        assignment_id: 42,
      }),
      (err: Error) => err.message.includes("RLS denied"),
    );

    // Both writes must have been attempted — the contract is "throw on the
    // 2nd error", not "skip the 2nd write".
    assert.deepEqual(fromCalls, ["strength_session_runs", "session_assignments"]);
  });

  it("returns ok when both updates succeed (status=completed + assignment_id)", async () => {
    scripts.push(
      { expect: "strength_session_runs", result: { data: null, error: null } },
      { expect: "session_assignments", result: { data: null, error: null } },
    );

    const { updateStrengthRun } = await import("../strength.ts");
    const result = await updateStrengthRun({
      run_id: 1,
      status: "completed",
      assignment_id: 42,
    });

    assert.deepEqual(result, { status: "ok" });
    assert.deepEqual(fromCalls, ["strength_session_runs", "session_assignments"]);
    // Sanity: session_assignments was updated to status=completed
    assert.deepEqual(updatedPayloads[1], { status: "completed" });
  });

  it("does not call session_assignments when assignment_id is missing", async () => {
    // Pure run completion (catalog session, no coach assignment) — the
    // 2nd write must be skipped. Otherwise we'd hit a NPE (eq null).
    scripts.push(
      { expect: "strength_session_runs", result: { data: null, error: null } },
    );

    const { updateStrengthRun } = await import("../strength.ts");
    const result = await updateStrengthRun({
      run_id: 7,
      status: "completed",
    });

    assert.deepEqual(result, { status: "ok" });
    assert.deepEqual(fromCalls, ["strength_session_runs"]);
  });

  it("does not call session_assignments when status is not 'completed'", async () => {
    // In-progress updates (per-set progress_pct) shouldn't touch the
    // assignment status — that's only meaningful at completion.
    scripts.push(
      { expect: "strength_session_runs", result: { data: null, error: null } },
    );

    const { updateStrengthRun } = await import("../strength.ts");
    const result = await updateStrengthRun({
      run_id: 1,
      status: "in_progress",
      progress_pct: 50,
      assignment_id: 42,
    });

    assert.deepEqual(result, { status: "ok" });
    assert.deepEqual(fromCalls, ["strength_session_runs"]);
  });

  it("throws when the 1st update (strength_session_runs) fails", async () => {
    // Symmetrical to the §159 case but for the 1st call — covered before
    // §159 too, but pin it so a future refactor can't accidentally swallow.
    scripts.push(
      {
        expect: "strength_session_runs",
        result: { data: null, error: { message: "Connection reset" } },
      },
    );

    const { updateStrengthRun } = await import("../strength.ts");

    await assert.rejects(
      () => updateStrengthRun({ run_id: 1, status: "completed", assignment_id: 42 }),
      (err: Error) => err.message.includes("Connection reset"),
    );

    assert.deepEqual(fromCalls, ["strength_session_runs"]);
  });
});

describe("reconcileStrengthRunLogs", () => {
  beforeEach(() => {
    scripts.length = 0;
    fromCalls.length = 0;
    updatedPayloads.length = 0;
  });

  it("returns empty result when logs array is empty (no DB call)", async () => {
    // Defensive guard — caller passes [] when activeRunLogs is null/empty.
    // No script needed; the implementation must short-circuit before any
    // supabase.from() call.
    const { reconcileStrengthRunLogs } = await import("../strength.ts");
    const result = await reconcileStrengthRunLogs({
      runId: 1,
      logs: [],
      athleteId: 5,
      athleteName: "Alice",
    });
    assert.deepEqual(result, { attempted: 0, succeeded: 0, errors: [] });
    assert.deepEqual(fromCalls, []);
  });

  it("throws when the count query fails (was silently returning before §170)", async () => {
    // Pre-§170 this returned a clean result and the caller assumed the
    // reconcile succeeded — actual DB state could be drifted.
    scripts.push(
      {
        expect: "strength_set_logs",
        result: { data: null, error: { message: "RLS policy violation" } },
      },
    );

    const { reconcileStrengthRunLogs } = await import("../strength.ts");
    await assert.rejects(
      () => reconcileStrengthRunLogs({
        runId: 1,
        logs: [{ exercise_id: 10, set_number: 1, reps: 5, weight: 80 }],
        athleteId: 5,
      }),
      (err: Error) => err.message.includes("count query failed"),
    );
  });

  it("returns no-op result when remoteCount >= local logs length", async () => {
    // Common case after a successful online run: server already has all
    // sets via fire-and-forget per-set saves. Reconcile is idempotent.
    scripts.push(
      {
        expect: "strength_set_logs",
        // count: exact head:true returns count, no data
        result: { data: null, error: null, count: 3 } as ChainScript["result"] & { count: number },
      },
    );

    const { reconcileStrengthRunLogs } = await import("../strength.ts");
    const result = await reconcileStrengthRunLogs({
      runId: 1,
      logs: [
        { exercise_id: 10, set_number: 1, reps: 5, weight: 80 },
        { exercise_id: 10, set_number: 2, reps: 5, weight: 82.5 },
        { exercise_id: 10, set_number: 3, reps: 5, weight: 85 },
      ],
      athleteId: 5,
    });
    assert.deepEqual(result, { attempted: 0, succeeded: 0, errors: [] });
    // Only the count query was issued — no per-set inserts.
    assert.deepEqual(fromCalls, ["strength_set_logs"]);
  });
});

describe("logStrengthSet — branch coverage", () => {
  beforeEach(() => {
    scripts.length = 0;
    fromCalls.length = 0;
    updatedPayloads.length = 0;
    rpcCalls.length = 0;
    rpcResults.length = 0;
  });

  it("falls back to a plain insert when athlete_id is missing (no RPC, no 1RM update)", async () => {
    // Anonymous swimmer (catalog session, no athlete context). The atomic
    // RPC needs p_user_id, so the implementation falls back to a plain
    // strength_set_logs INSERT. one_rm_updated must be false — there's
    // no athlete to attach a PR to.
    scripts.push(
      { expect: "strength_set_logs", result: { data: null, error: null } },
    );

    const { logStrengthSet } = await import("../strength.ts");
    const result = await logStrengthSet({
      run_id: 1,
      exercise_id: 10,
      reps: 8,
      weight: 80,
      // athlete_id and athlete_name both null → fallback path
    });

    assert.deepEqual(result, { status: "ok", one_rm_updated: false, one_rm: undefined });
    assert.deepEqual(fromCalls, ["strength_set_logs"]);
    // No RPC must have been hit on this branch.
    assert.equal(rpcCalls.length, 0);
  });

  it("uses the atomic RPC when athlete_id is present (single round-trip, server-side 1RM update)", async () => {
    rpcResults.push({
      data: { set_id: 42, one_rm_updated: true, one_rm: 100 },
      error: null,
    });

    const { logStrengthSet } = await import("../strength.ts");
    const result = await logStrengthSet({
      run_id: 1,
      exercise_id: 10,
      reps: 5,
      weight: 100,
      athlete_id: 7,
    });

    assert.deepEqual(result, { status: "ok", one_rm_updated: true, one_rm: 100 });
    // No `from()` call: the RPC handles both insert + 1RM update atomically.
    assert.deepEqual(fromCalls, []);
    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0].name, "log_strength_set_atomic");
    const args = rpcCalls[0].args as Record<string, unknown>;
    assert.equal(args.p_user_id, 7);
    assert.equal(args.p_exercise_id, 10);
    // 1RM estimate computed client-side from (weight=100, reps=5) ≈ 115 (Brzycki).
    // The exact value comes from estimateOneRm(); just assert it's > 0 (i.e. not null).
    assert.ok(typeof args.p_one_rm_estimate === "number" && (args.p_one_rm_estimate as number) > 0);
  });

  it("passes p_one_rm_estimate=null for bodyweight sets (skip 1RM, prevents PDC contamination)", async () => {
    // Bodyweight sentinel = -1. The previous implementation passed weight=-1
    // through estimateOneRm and produced absurd 1RM values. §95 fix routed
    // it via isBodyweight() to skip estimation entirely.
    rpcResults.push({
      data: { set_id: 50, one_rm_updated: false, one_rm: null },
      error: null,
    });

    const { logStrengthSet } = await import("../strength.ts");
    await logStrengthSet({
      run_id: 1,
      exercise_id: 10,
      reps: 12,
      weight: -1, // BODYWEIGHT_SENTINEL
      athlete_id: 7,
    });

    assert.equal(rpcCalls.length, 1);
    const args = rpcCalls[0].args as Record<string, unknown>;
    assert.equal(args.p_one_rm_estimate, null, "bodyweight must skip 1RM estimation");
    // Server still receives the raw -1 weight to log the set itself.
    assert.equal(args.p_weight, -1);
  });

  it("throws when the RPC returns an error (post-§174 withTimeout still propagates supabase errors)", async () => {
    rpcResults.push({
      data: null,
      error: { message: "RLS denied: athlete_id mismatch" },
    });

    const { logStrengthSet } = await import("../strength.ts");

    await assert.rejects(
      () => logStrengthSet({
        run_id: 1,
        exercise_id: 10,
        reps: 5,
        weight: 80,
        athlete_id: 7,
      }),
      (err: Error) => err.message.includes("RLS denied"),
    );
  });

  it("throws on insert error in the fallback branch (no silent swallow when athlete_id missing)", async () => {
    // Symmetrical to the success fallback: the no-athlete path must still
    // surface DB errors to the caller. Otherwise a swimmer running an
    // anonymous catalog session could lose sets without any signal.
    scripts.push(
      {
        expect: "strength_set_logs",
        result: { data: null, error: { message: "Connection reset" } },
      },
    );

    const { logStrengthSet } = await import("../strength.ts");
    await assert.rejects(
      () => logStrengthSet({
        run_id: 1,
        exercise_id: 10,
        reps: 5,
        weight: 80,
      }),
      (err: Error) => err.message.includes("Connection reset"),
    );
  });
});
