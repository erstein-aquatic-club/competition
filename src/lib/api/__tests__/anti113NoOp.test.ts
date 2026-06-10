/**
 * §113 no-op detection — swim.ts and timesheet.ts
 *
 * Verifies that DELETE/UPDATE functions throw an explicit error when Supabase
 * returns 0 rows (RLS block or row not found), rather than silently succeeding.
 */

import assert from "node:assert/strict";
import { describe, it, before, beforeEach, mock } from "node:test";

type ChainScript = {
  expect?: string;
  result: { data: unknown; error: null | { message: string; code?: string } };
};

const scripts: ChainScript[] = [];

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
      eq: () => chain,
      in: () => chain,
      is: () => chain,
      not: () => chain,
      or: () => chain,
      like: () => chain,
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

beforeEach(() => {
  scripts.length = 0;
});

// ─── swim.ts ──────────────────────────────────────────────────────────────────

describe("deleteSwimSession — §113 no-op detection", () => {
  it("throws when RLS blocks deletion (0 rows returned)", async () => {
    scripts.push({
      expect: "swim_sessions_catalog",
      result: { data: [], error: null },
    });
    const { deleteSwimSession } = await import("../swim.ts");
    await assert.rejects(
      () => deleteSwimSession(42),
      /Suppression refusée ou séance introuvable/,
    );
  });

  it("succeeds when deletion affects 1 row", async () => {
    scripts.push({
      expect: "swim_sessions_catalog",
      result: { data: [{ id: 42 }], error: null },
    });
    const { deleteSwimSession } = await import("../swim.ts");
    const result = await deleteSwimSession(42);
    assert.equal(result.status, "deleted");
  });
});

describe("archiveSwimSession — §113 no-op detection", () => {
  it("throws when RLS blocks update (0 rows returned)", async () => {
    scripts.push({
      expect: "swim_sessions_catalog",
      result: { data: [], error: null },
    });
    const { archiveSwimSession } = await import("../swim.ts");
    await assert.rejects(
      () => archiveSwimSession(99, true),
      /Modification refusée ou séance introuvable/,
    );
  });
});

// ─── timesheet.ts ─────────────────────────────────────────────────────────────

describe("updateTimesheetShift — §113 no-op detection", () => {
  it("throws when RLS blocks update (0 rows returned)", async () => {
    scripts.push({
      expect: "timesheet_shifts",
      result: { data: [], error: null },
    });
    const { updateTimesheetShift } = await import("../timesheet.ts");
    await assert.rejects(
      () => updateTimesheetShift({ id: 7, location: "Piscine" }),
      /Mise à jour refusée ou créneau introuvable/,
    );
  });

  it("succeeds when update affects 1 row", async () => {
    scripts.push({
      expect: "timesheet_shifts",
      result: { data: [{ id: 7 }], error: null },
    });
    const { updateTimesheetShift } = await import("../timesheet.ts");
    const result = await updateTimesheetShift({ id: 7, location: "Piscine" });
    assert.equal(result.status, "updated");
  });
});

describe("deleteTimesheetShift — §113 no-op detection", () => {
  it("throws when RLS blocks deletion (0 rows returned)", async () => {
    scripts.push({
      expect: "timesheet_shifts",
      result: { data: [], error: null },
    });
    const { deleteTimesheetShift } = await import("../timesheet.ts");
    await assert.rejects(
      () => deleteTimesheetShift({ id: 7 }),
      /Suppression refusée ou créneau introuvable/,
    );
  });
});
