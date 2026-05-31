import assert from "node:assert/strict";
import { describe, it, before, beforeEach, mock } from "node:test";

/**
 * §351 — `getCommonWarmupRoutine()` : lit la routine articulaire commune
 * (Bloc 1 de l'échauffement) depuis `warmup_common_routine`, renvoie les
 * `exercise_id` ordonnés par `ordre`.
 *
 * Mocking : on calque le pattern `mock.module("../client.ts", …)` des autres
 * tests api (cf. `strength.test.ts`) — chaque `from()` consomme une entrée
 * `scripts` en FIFO, et `canUseSupabase` est pilotable par test.
 */

type ChainScript = {
  expect?: string;
  result: { data: unknown; error: null | { message: string; code?: string } };
};

const scripts: ChainScript[] = [];
const fromCalls: string[] = [];
let canUse = true;

before(async () => {
  const real = await import("../client.ts");

  function makeChain(script: ChainScript) {
    const result = script.result;
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      eq: () => chain,
      in: () => chain,
      then: (resolve: (v: unknown) => void) => resolve(result),
    };
    return chain;
  }

  mock.module("../client.ts", {
    namedExports: {
      ...real,
      canUseSupabase: () => canUse,
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

describe("getCommonWarmupRoutine — §351", () => {
  beforeEach(() => {
    scripts.length = 0;
    fromCalls.length = 0;
    canUse = true;
  });

  it("renvoie les exercise_id ordonnés par ordre", async () => {
    scripts.push({
      expect: "warmup_common_routine",
      result: {
        data: [
          { exercise_id: 87, ordre: 1 },
          { exercise_id: 84, ordre: 2 },
          { exercise_id: 24, ordre: 3 },
        ],
        error: null,
      },
    });

    const { getCommonWarmupRoutine } = await import("../strength-warmup.ts");
    const ids = await getCommonWarmupRoutine();

    assert.deepEqual(ids, [87, 84, 24]);
    assert.deepEqual(fromCalls, ["warmup_common_routine"]);
  });

  it("renvoie [] quand Supabase est indisponible", async () => {
    canUse = false;

    const { getCommonWarmupRoutine } = await import("../strength-warmup.ts");
    const ids = await getCommonWarmupRoutine();

    assert.deepEqual(ids, []);
    // Aucun appel réseau ne doit avoir été tenté.
    assert.deepEqual(fromCalls, []);
  });
});

describe("getActivationRoutine — §352", () => {
  beforeEach(() => {
    scripts.length = 0;
    fromCalls.length = 0;
    canUse = true;
  });

  it("regroupe les exercise_id par seau, ordonnés", async () => {
    scripts.push({
      expect: "warmup_activation_routine",
      result: {
        data: [
          { bucket: "upper_strength", exercise_id: 74, ordre: 1 },
          { bucket: "upper_strength", exercise_id: 49, ordre: 2 },
          { bucket: "lower_power", exercise_id: 96, ordre: 1 },
        ],
        error: null,
      },
    });

    const { getActivationRoutine } = await import("../strength-warmup.ts");
    const map = await getActivationRoutine();

    assert.deepEqual(map, { upper_strength: [74, 49], lower_power: [96] });
    assert.deepEqual(fromCalls, ["warmup_activation_routine"]);
  });

  it("renvoie {} quand Supabase est indisponible", async () => {
    canUse = false;

    const { getActivationRoutine } = await import("../strength-warmup.ts");
    const map = await getActivationRoutine();

    assert.deepEqual(map, {});
    assert.deepEqual(fromCalls, []);
  });
});
