import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapDbExerciseToApi, mapApiExerciseToDb } from "@/lib/api/client";
import { normalizeExercise } from "@/lib/api/helpers";

describe("exercise mappers — is_bodyweight (§297)", () => {
  it("mapDbExerciseToApi reads is_bodyweight from DB row", () => {
    const row = { id: 1, nom_exercice: "Pompes", is_bodyweight: true };
    const result = mapDbExerciseToApi(row);
    assert.equal(result.is_bodyweight, true);
  });

  it("mapDbExerciseToApi defaults is_bodyweight to false when absent", () => {
    const row = { id: 1, nom_exercice: "Squat" };
    const result = mapDbExerciseToApi(row);
    assert.equal(result.is_bodyweight, false);
  });

  it("mapApiExerciseToDb writes is_bodyweight to DB row", () => {
    const ex = { id: 1, nom_exercice: "Tractions", is_bodyweight: true } as Parameters<typeof mapApiExerciseToDb>[0];
    const result = mapApiExerciseToDb(ex);
    assert.equal(result.is_bodyweight, true);
  });

  it("mapApiExerciseToDb defaults is_bodyweight to false when undefined", () => {
    const ex = { id: 1, nom_exercice: "Squat" } as Parameters<typeof mapApiExerciseToDb>[0];
    const result = mapApiExerciseToDb(ex);
    assert.equal(result.is_bodyweight, false);
  });

  it("normalizeExercise preserves is_bodyweight from localStorage", () => {
    const ex = { id: 1, nom_exercice: "Dips", is_bodyweight: true };
    const result = normalizeExercise(ex);
    assert.equal(result.is_bodyweight, true);
  });
});
