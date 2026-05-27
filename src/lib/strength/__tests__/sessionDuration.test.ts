import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EXEC_SECONDS_PER_SET,
  estimateStrengthSessionDurationSeconds,
  formatApproxMinutes,
} from "@/lib/strength/sessionDuration";
import type { StrengthSessionItem } from "@/lib/api/types";

function makeItem(overrides: Partial<StrengthSessionItem> = {}): StrengthSessionItem {
  return {
    exercise_id: 1,
    order_index: 0,
    sets: 4,
    reps: 8,
    rest_seconds: 90,
    percent_1rm: 0,
    ...overrides,
  };
}

describe("estimateStrengthSessionDurationSeconds", () => {
  it("compte 1 repos par série : sets × (60s exec + repos)", () => {
    // 4 séries, repos 90s → 4 × (60 + 90) = 600s
    const total = estimateStrengthSessionDurationSeconds([makeItem({ sets: 4, rest_seconds: 90 })]);
    assert.equal(total, 600);
  });

  it("somme tous les exercices", () => {
    // 4×(60+90)=600 + 3×(60+60)=360 → 960
    const total = estimateStrengthSessionDurationSeconds([
      makeItem({ sets: 4, rest_seconds: 90 }),
      makeItem({ sets: 3, rest_seconds: 60 }),
    ]);
    assert.equal(total, 960);
  });

  it("repos absent (0) → uniquement le temps d'exécution", () => {
    // 3 × 60 = 180
    const total = estimateStrengthSessionDurationSeconds([makeItem({ sets: 3, rest_seconds: 0 })]);
    assert.equal(total, 180);
  });

  it("séance vide → 0", () => {
    assert.equal(estimateStrengthSessionDurationSeconds([]), 0);
  });

  it("sets nul/négatif/non fini → l'exo compte 0", () => {
    const zero = estimateStrengthSessionDurationSeconds([makeItem({ sets: 0, rest_seconds: 90 })]);
    assert.equal(zero, 0);
    const negative = estimateStrengthSessionDurationSeconds([
      makeItem({ sets: -2 as unknown as number, rest_seconds: 90 }),
    ]);
    assert.equal(negative, 0);
    const nan = estimateStrengthSessionDurationSeconds([
      makeItem({ sets: NaN as unknown as number, rest_seconds: 90 }),
    ]);
    assert.equal(nan, 0);
  });

  it("repos invalide (négatif/non fini) → traité comme 0", () => {
    const total = estimateStrengthSessionDurationSeconds([
      makeItem({ sets: 3, rest_seconds: -30 as unknown as number }),
    ]);
    assert.equal(total, 3 * EXEC_SECONDS_PER_SET);
  });

  it("inclut les items d'échauffement/mobilité", () => {
    // warmup 2×(60+30)=180 + main 4×(60+90)=600 → 780
    const total = estimateStrengthSessionDurationSeconds([
      makeItem({ block: "warmup", sets: 2, rest_seconds: 30 }),
      makeItem({ block: "main", sets: 4, rest_seconds: 90 }),
    ]);
    assert.equal(total, 780);
  });
});

describe("formatApproxMinutes", () => {
  it("arrondit à la minute la plus proche avec préfixe ~", () => {
    assert.equal(formatApproxMinutes(600), "~10 min");
    assert.equal(formatApproxMinutes(510), "~9 min"); // 8,5 → 9
    assert.equal(formatApproxMinutes(605), "~10 min");
  });

  it("plancher à 1 min quand la durée est positive mais < 30s", () => {
    assert.equal(formatApproxMinutes(20), "~1 min");
  });
});
