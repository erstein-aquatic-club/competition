import assert from "node:assert/strict";
import { describe, it, before, beforeEach, mock } from "node:test";

/**
 * §394 (R3) — un exercice archivé ne doit plus être pioché par le moteur de
 * mésocycle ni proposé dans l'éditeur d'échauffement : `listCatalogExercisesTagged`
 * filtre `archived_at IS NULL` côté serveur.
 */

const filters: { op: string; col: string; val: unknown }[] = [];

before(async () => {
  const real = await import("../client.ts");
  const chain: Record<string, unknown> = {
    select: () => chain,
    not: (col: string, _op: string, val: unknown) => {
      filters.push({ op: "not", col, val });
      return chain;
    },
    is: (col: string, val: unknown) => {
      filters.push({ op: "is", col, val });
      return chain;
    },
    then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
  };
  mock.module("../client.ts", {
    namedExports: {
      ...real,
      canUseSupabase: () => true,
      supabase: { from: () => chain },
    },
  });
});

describe("listCatalogExercisesTagged", () => {
  beforeEach(() => {
    filters.length = 0;
  });

  it("exclut les exercices archivés", async () => {
    const { listCatalogExercisesTagged } = await import("../strength-catalog.ts");
    await listCatalogExercisesTagged();
    assert.ok(
      filters.some((f) => f.op === "is" && f.col === "archived_at" && f.val === null),
      `filtre archived_at IS NULL absent : ${JSON.stringify(filters)}`,
    );
  });
});
