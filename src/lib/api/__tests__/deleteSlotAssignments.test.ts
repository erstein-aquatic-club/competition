import assert from "node:assert/strict";
import { describe, it, before, beforeEach } from "node:test";
import { mock } from "node:test";

type Call = { method: string; args: unknown[] };

// Shared mutable state: the mock is installed once (before any import of
// assignments.ts) and each test mutates these two refs to drive behaviour.
const calls: Call[] = [];
let isResult: { error: null | { message: string } } = { error: null };

before(async () => {
  const real = await import("../client.ts");

  const chain: Record<string, (...args: unknown[]) => unknown> = {
    delete: (...args) => {
      calls.push({ method: "delete", args });
      return chain;
    },
    eq: (...args) => {
      calls.push({ method: "eq", args });
      return chain;
    },
    is: (...args) => {
      calls.push({ method: "is", args });
      return isResult;
    },
  };

  mock.module("../client.ts", {
    namedExports: {
      ...real,
      canUseSupabase: () => true,
      supabase: {
        from: (...args: unknown[]) => {
          calls.push({ method: "from", args });
          return chain;
        },
      },
    },
  });
});

describe("deleteSlotAssignments", () => {
  beforeEach(() => {
    calls.length = 0;
    isResult = { error: null };
  });

  it("scopes delete to target_user_id IS NULL (preserves individuals)", async () => {
    const { deleteSlotAssignments } = await import("../assignments.ts");
    await deleteSlotAssignments({
      trainingSlotId: "slot-abc",
      scheduledDate: "2026-04-09",
    });

    const fromCall = calls.find((c) => c.method === "from");
    assert.ok(fromCall, "expected supabase.from(...) to be called");
    assert.deepEqual(fromCall.args, ["session_assignments"]);

    const eqCalls = calls.filter((c) => c.method === "eq");
    assert.deepEqual(eqCalls[0]?.args, ["training_slot_id", "slot-abc"]);
    assert.deepEqual(eqCalls[1]?.args, ["scheduled_date", "2026-04-09"]);

    // .is("target_user_id", null) preserves individual assignments (§144).
    const isCall = calls.find((c) => c.method === "is");
    assert.ok(isCall, "expected .is(...) to be called to scope delete");
    assert.deepEqual(isCall.args, ["target_user_id", null]);
  });

  it("throws when supabase returns an error", async () => {
    isResult = { error: { message: "boom" } };
    const { deleteSlotAssignments } = await import("../assignments.ts");
    await assert.rejects(
      () =>
        deleteSlotAssignments({
          trainingSlotId: "slot-abc",
          scheduledDate: "2026-04-09",
        }),
      /boom/,
    );
  });
});
