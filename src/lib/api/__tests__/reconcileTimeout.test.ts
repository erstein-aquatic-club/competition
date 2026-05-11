import assert from "node:assert/strict";
import { describe, it, before, beforeEach, mock } from "node:test";

/**
 * Tests for §177 — reconcileStrengthRunLogs timeout wrapper.
 *
 * The production code wraps the Promise.allSettled batch with
 * withTimeout(..., 30_000, "reconcile-batch") so that hanging
 * logStrengthSet calls cannot block the UI indefinitely.
 *
 * These tests mock withTimeout to use a short wall-clock deadline
 * (80 ms) so the suite completes in < 1 s, while still exercising
 * the real reconcileStrengthRunLogs logic.
 *
 * We pass athlete_id: null so logStrengthSet takes the
 * supabase.from("strength_set_logs").insert() path (no inner RPC /
 * inner withTimeout), keeping the hang at the outer batch level only.
 */

// Per-call behavior for the supabase mock.
// Each entry is consumed FIFO by supabase.from().
type FromScript =
  | { kind: "count"; count: number; error: null | { message: string } }
  | { kind: "insert"; hang: boolean; error: null | { message: string } };

const scripts: FromScript[] = [];
const fromCalls: string[] = [];

before(async () => {
  const real = await import("../client.ts");

  mock.module("../client.ts", {
    namedExports: {
      ...real,
      canUseSupabase: () => true,
      // Replace withTimeout with an 80 ms version so tests finish fast.
      withTimeout: <T>(promise: Promise<T>, _ms: number, label = "rpc"): Promise<T> =>
        Promise.race([
          promise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`${label}: timeout after 80ms`)), 80),
          ),
        ]),
      supabase: {
        from: (table: string) => {
          fromCalls.push(table);
          const script = scripts.shift();
          if (!script) {
            throw new Error(`Unexpected supabase.from("${table}") — scripts empty`);
          }

          const makeChain = (resolveWith: unknown): Record<string, unknown> => {
            const thenable = {
              then: (resolve: (v: unknown) => void) => resolve(resolveWith),
            };
            const chain: Record<string, unknown> = {
              select: () => chain,
              insert: () => chain,
              upsert: () => chain,
              update: () => chain,
              delete: () => chain,
              eq: () => chain,
              in: () => chain,
              order: () => chain,
              limit: () => chain,
              single: () => chain,
              maybeSingle: () => chain,
              then: thenable.then,
            };
            return chain;
          };

          const makeHangingChain = (): Record<string, unknown> => {
            // Returns a thenable that never resolves/rejects.
            const neverResolve = new Promise<never>(() => {/* intentionally hangs */});
            const chain: Record<string, unknown> = {
              select: () => chain,
              insert: () => chain,
              upsert: () => chain,
              update: () => chain,
              delete: () => chain,
              eq: () => chain,
              in: () => chain,
              order: () => chain,
              limit: () => chain,
              single: () => chain,
              maybeSingle: () => chain,
              then: (resolve: (v: unknown) => void, reject: (r: unknown) => void) =>
                neverResolve.then(resolve, reject),
            };
            return chain;
          };

          if (script.kind === "count") {
            return makeChain({ data: null, error: script.error, count: script.count });
          }
          // insert
          if (script.hang) return makeHangingChain();
          return makeChain({ data: null, error: script.error });
        },
        rpc: () => ({ then: (r: (v: unknown) => void) => r({ data: null, error: null }) }),
      },
    },
  });
});

beforeEach(() => {
  scripts.length = 0;
  fromCalls.length = 0;
});

const makeLog = (i: number) => ({
  exercise_id: 10 + i,
  set_number: i + 1,
  reps: 5,
  weight: 80,
  difficulty: null,
});

describe("reconcileStrengthRunLogs — §177 timeout wrapper", () => {
  it("rejects with 'reconcile-batch: timeout' when a single insert hangs indefinitely", async () => {
    // Count query: 0 remote rows. 1 local log → enters the allSettled batch.
    // The insert hangs → outer withTimeout (80 ms) fires before allSettled settles.
    scripts.push(
      { kind: "count", count: 0, error: null },
      { kind: "insert", hang: true, error: null },
    );

    const { reconcileStrengthRunLogs } = await import("../strength.ts");

    await assert.rejects(
      () =>
        reconcileStrengthRunLogs({
          runId: 42,
          logs: [makeLog(0)],
          athleteId: null,   // null → supabase.from().insert() path, no inner RPC
          athleteName: null,
        }),
      (err: Error) => {
        assert.ok(
          err.message.includes("reconcile-batch") && err.message.includes("timeout"),
          `Expected reconcile-batch timeout, got: ${err.message}`,
        );
        return true;
      },
    );
  });

  it("rejects with timeout when 1 of 5 inserts hangs (allSettled waits for all)", async () => {
    // 5 local logs; 4 insert fast, 1 hangs forever.
    // allSettled doesn't settle until every promise resolves/rejects,
    // so the outer timeout fires before it can collect all results.
    scripts.push(
      { kind: "count", count: 0, error: null },
      { kind: "insert", hang: false, error: null },
      { kind: "insert", hang: false, error: null },
      { kind: "insert", hang: true,  error: null }, // 3rd hangs
      { kind: "insert", hang: false, error: null },
      { kind: "insert", hang: false, error: null },
    );

    const { reconcileStrengthRunLogs } = await import("../strength.ts");

    await assert.rejects(
      () =>
        reconcileStrengthRunLogs({
          runId: 42,
          logs: [makeLog(0), makeLog(1), makeLog(2), makeLog(3), makeLog(4)],
          athleteId: null,
          athleteName: null,
        }),
      (err: Error) => {
        assert.ok(
          err.message.includes("reconcile-batch") && err.message.includes("timeout"),
          `Expected reconcile-batch timeout, got: ${err.message}`,
        );
        return true;
      },
    );
  });

  it("resolves successfully when all 5 inserts resolve quickly (well under timeout)", async () => {
    scripts.push(
      { kind: "count", count: 0, error: null },
      { kind: "insert", hang: false, error: null },
      { kind: "insert", hang: false, error: null },
      { kind: "insert", hang: false, error: null },
      { kind: "insert", hang: false, error: null },
      { kind: "insert", hang: false, error: null },
    );

    const { reconcileStrengthRunLogs } = await import("../strength.ts");

    const start = Date.now();
    const result = await reconcileStrengthRunLogs({
      runId: 42,
      logs: [makeLog(0), makeLog(1), makeLog(2), makeLog(3), makeLog(4)],
      athleteId: null,
      athleteName: null,
    });
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 200, `Expected fast resolution, took ${elapsed}ms`);
    assert.equal(result.attempted, 5);
    assert.equal(result.succeeded, 5);
    assert.deepEqual(result.errors, []);
  });
});
