import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeMissing1RmExercises } from "@/lib/strength/missing1rmFilter";

const ex = (id: number, isBw: boolean) => ({
  id,
  nom_exercice: `Ex ${id}`,
  exercise_type: "strength" as const,
  is_bodyweight: isBw,
});

describe("computeMissing1RmExercises (§297)", () => {
  const exerciseLookup = new Map([
    [1, ex(1, false)],
    [2, ex(2, true)],   // PDC
    [3, ex(3, false)],
  ]);

  it("renvoie les exos non-PDC avec %1RM > 0 et sans 1RM enregistré", () => {
    const items = [
      { exercise_id: 1, percent_1rm: 75 },
      { exercise_id: 2, percent_1rm: 0 },
      { exercise_id: 3, percent_1rm: 80 },
    ] as Parameters<typeof computeMissing1RmExercises>[0];
    const oneRMs = [{ exercise_id: 3, weight: 100 }] as Parameters<typeof computeMissing1RmExercises>[1];
    const result = computeMissing1RmExercises(items, oneRMs, exerciseLookup);
    assert.deepEqual(result, [{ exerciseId: 1, exerciseName: "Ex 1" }]);
  });

  it("exclut un exo PDC même si percent_1rm > 0 (coach a oublié de remettre à 0)", () => {
    const items = [
      { exercise_id: 2, percent_1rm: 60 },
    ] as Parameters<typeof computeMissing1RmExercises>[0];
    const result = computeMissing1RmExercises(items, [], exerciseLookup);
    assert.deepEqual(result, []);
  });

  it("exclut les items avec percent_1rm = 0", () => {
    const items = [
      { exercise_id: 1, percent_1rm: 0 },
    ] as Parameters<typeof computeMissing1RmExercises>[0];
    const result = computeMissing1RmExercises(items, [], exerciseLookup);
    assert.deepEqual(result, []);
  });

  it("exclut les exos qui ont déjà un 1RM enregistré", () => {
    const items = [
      { exercise_id: 1, percent_1rm: 75 },
    ] as Parameters<typeof computeMissing1RmExercises>[0];
    const oneRMs = [{ exercise_id: 1, weight: 80 }] as Parameters<typeof computeMissing1RmExercises>[1];
    const result = computeMissing1RmExercises(items, oneRMs, exerciseLookup);
    assert.deepEqual(result, []);
  });
});
