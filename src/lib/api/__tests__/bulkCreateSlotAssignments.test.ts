import assert from "node:assert/strict";
import { describe, it, before, beforeEach, mock } from "node:test";

// Each entry represents one call to supabase.from(<table>) and the leaf result
// its chain should resolve to. The mock consumes them in FIFO order.
type ChainScript = {
  expect?: string;
  result: { data: unknown; error: null | { message: string; code?: string } };
};

const scripts: ChainScript[] = [];
const fromCalls: string[] = [];
const insertedRows: unknown[] = [];

before(async () => {
  const real = await import("../client.ts");

  function makeChain(script: ChainScript) {
    const result = script.result;
    // All chainable methods return the chain; the leaf-awaitable is the same
    // thenable so `await supabase.from(...).select().eq()...` resolves to the
    // script's `result` regardless of which method ends the chain.
    const thenable = {
      then: (resolve: (v: unknown) => void) => resolve(result),
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: (rows: unknown) => {
        insertedRows.push(rows);
        return chain;
      },
      eq: () => chain,
      in: () => chain,
      is: () => chain,
      not: () => chain,
      order: () => chain,
      delete: () => chain,
      update: () => chain,
      limit: () => chain,
      single: () => chain,
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
      },
    },
  });
});

describe("bulkCreateSlotAssignments", () => {
  beforeEach(() => {
    scripts.length = 0;
    fromCalls.length = 0;
    insertedRows.length = 0;
  });

  it("returns { created, preservedIndividuals: [] } when no individuals exist", async () => {
    // Script: [pre-check duplicates] → [fetch individuals] → [insert groups]
    scripts.push(
      { expect: "session_assignments", result: { data: [], error: null } },
      { expect: "session_assignments", result: { data: [], error: null } },
      {
        expect: "session_assignments",
        result: { data: [{ id: 10 }, { id: 11 }], error: null },
      },
    );

    const { bulkCreateSlotAssignments } = await import("../assignments.ts");
    const result = await bulkCreateSlotAssignments({
      swimCatalogId: 42,
      trainingSlotId: "slot-1",
      scheduledDate: "2026-04-09",
      groupIds: [1, 2],
      scheduledSlot: "evening",
      visibleFrom: null,
      assignedBy: 99,
    });

    assert.equal(result.created, 2);
    assert.deepEqual(result.preservedIndividuals, []);
  });

  it("returns preservedIndividuals describing existing individual assignments", async () => {
    scripts.push(
      // Pre-check: no existing group duplicates
      { expect: "session_assignments", result: { data: [], error: null } },
      // Fetch individuals preserved on this slot+date
      {
        expect: "session_assignments",
        result: {
          data: [
            {
              target_user_id: 7,
              users: { display_name: "François Wagner" },
              swim_sessions_catalog: { name: "Sprint 100m" },
            },
          ],
          error: null,
        },
      },
      // Insert group rows
      {
        expect: "session_assignments",
        result: { data: [{ id: 20 }], error: null },
      },
    );

    const { bulkCreateSlotAssignments } = await import("../assignments.ts");
    const result = await bulkCreateSlotAssignments({
      swimCatalogId: 42,
      trainingSlotId: "slot-1",
      scheduledDate: "2026-04-09",
      groupIds: [1],
      scheduledSlot: "evening",
      visibleFrom: null,
      assignedBy: 99,
    });

    assert.equal(result.created, 1);
    assert.equal(result.preservedIndividuals.length, 1);
    assert.deepEqual(result.preservedIndividuals[0], {
      userId: 7,
      displayName: "François Wagner",
      sessionTitle: "Sprint 100m",
    });
  });

  it("throws and does not insert when a group duplicate pre-check finds rows", async () => {
    scripts.push({
      expect: "session_assignments",
      result: { data: [{ id: 99 }], error: null },
    });

    const { bulkCreateSlotAssignments } = await import("../assignments.ts");
    await assert.rejects(
      () =>
        bulkCreateSlotAssignments({
          swimCatalogId: 42,
          trainingSlotId: "slot-1",
          scheduledDate: "2026-04-09",
          groupIds: [1],
          scheduledSlot: "evening",
          visibleFrom: null,
          assignedBy: 99,
        }),
      /déjà/,
    );
    assert.equal(insertedRows.length, 0);
  });
});
