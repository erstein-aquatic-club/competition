import assert from "node:assert/strict";
import { describe, it, before, beforeEach, mock } from "node:test";

/**
 * §194 — Régression : `assignments_create` ne doit PLUS écrire dans
 * `notifications` ni `notification_targets`. Le trigger SQL
 * `auto_notify_session_assignment` (migration 00045) s'en charge déjà
 * sur INSERT dans `session_assignments`. Avant le fix, chaque assignation
 * muscu via `AthletePlansTab.tsx` créait 2 notifications + 2 pushs.
 */

type ChainScript = {
  expect?: string;
  result: { data: unknown; error: null | { message: string; code?: string } };
};

const scripts: ChainScript[] = [];
const fromCalls: string[] = [];

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

  mock.module("../swim", { namedExports: { getSwimCatalog: async () => [] } });
  mock.module("../strength", { namedExports: { getStrengthSessions: async () => [] } });
  mock.module("../swimmer-slots", { namedExports: { getSwimmerSlots: async () => [] } });
  mock.module("../localStorage", {
    namedExports: {
      localStorageGet: () => null,
      localStorageSave: () => undefined,
    },
  });
});

describe("assignments_create — délègue les notifs au trigger SQL", () => {
  beforeEach(() => {
    scripts.length = 0;
    fromCalls.length = 0;
  });

  it("n'écrit que dans session_assignments (pas de doublon notifications)", async () => {
    scripts.push({
      expect: "session_assignments",
      result: { data: { id: 42 }, error: null },
    });

    const { assignments_create } = await import("../assignments.ts");
    const result = await assignments_create(
      {
        session_id: 7,
        assignment_type: "strength",
        target_user_id: 11,
        scheduled_date: "2026-05-10",
        scheduled_slot: "evening",
      },
      99,
    );

    assert.equal(result.status, "assigned");
    assert.deepEqual(fromCalls, ["session_assignments"]);
    assert.equal(
      fromCalls.includes("notifications"),
      false,
      "ne doit plus appeler from('notifications') — le trigger 00045 s'en charge",
    );
    assert.equal(
      fromCalls.includes("notification_targets"),
      false,
      "ne doit plus appeler from('notification_targets')",
    );
  });

  it("propage l'erreur de session_assignments sans tenter de notif manuelle", async () => {
    scripts.push({
      expect: "session_assignments",
      result: { data: null, error: { message: "RLS denied" } },
    });

    const { assignments_create } = await import("../assignments.ts");
    await assert.rejects(
      () =>
        assignments_create(
          {
            session_id: 7,
            assignment_type: "swim",
            target_group_id: 3,
            scheduled_date: "2026-05-10",
          },
          99,
        ),
      /RLS denied/,
    );
    assert.deepEqual(fromCalls, ["session_assignments"]);
  });
});
