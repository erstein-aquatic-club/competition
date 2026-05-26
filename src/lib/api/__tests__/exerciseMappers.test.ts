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
});

describe("exercise mappers — selection_priority (§320)", () => {
  it("mapDbExerciseToApi reads selection_priority from DB row", () => {
    assert.equal(mapDbExerciseToApi({ id: 1, nom_exercice: "Tractions lestées", selection_priority: 100 }).selection_priority, 100);
    assert.equal(mapDbExerciseToApi({ id: 2, nom_exercice: "Front Lever", selection_priority: -10 }).selection_priority, -10);
  });

  it("mapDbExerciseToApi défaut 0 quand absent (pas de perte au round-trip)", () => {
    assert.equal(mapDbExerciseToApi({ id: 1, nom_exercice: "Squat" }).selection_priority, 0);
  });

  it("normalizeExercise lit selection_priority (sinon éditer un exo l'écraserait à 0)", () => {
    assert.equal(normalizeExercise({ id: 1, nom_exercice: "Box Jump", selection_priority: 100 }).selection_priority, 100);
    assert.equal(normalizeExercise({ id: 2, nom_exercice: "Squat" }).selection_priority, 0);
  });

  it("mapApiExerciseToDb écrit selection_priority (persistance de l'édition coach)", () => {
    const ex = { id: 1, nom_exercice: "Box Jump", selection_priority: 90 } as Parameters<typeof mapApiExerciseToDb>[0];
    assert.equal(mapApiExerciseToDb(ex).selection_priority, 90);
  });

  it("mapApiExerciseToDb défaut 0 quand undefined", () => {
    const ex = { id: 1, nom_exercice: "Squat" } as Parameters<typeof mapApiExerciseToDb>[0];
    assert.equal(mapApiExerciseToDb(ex).selection_priority, 0);
  });

  it("normalizeExercise preserves is_bodyweight from localStorage", () => {
    const ex = { id: 1, nom_exercice: "Dips", is_bodyweight: true };
    const result = normalizeExercise(ex);
    assert.equal(result.is_bodyweight, true);
  });
});

describe("exercise mappers — intensity_metric (§298)", () => {
  it("mapDbExerciseToApi lit intensity_metric", () => {
    const r = mapDbExerciseToApi({ id: 1, nom_exercice: "Box Jump", intensity_metric: "height_cm" });
    assert.equal(r.intensity_metric, "height_cm");
  });
  it("mapDbExerciseToApi défaut weight_kg si absent ou invalide", () => {
    assert.equal(mapDbExerciseToApi({ id: 1, nom_exercice: "Squat" }).intensity_metric, "weight_kg");
    assert.equal(mapDbExerciseToApi({ id: 1, nom_exercice: "X", intensity_metric: "bogus" }).intensity_metric, "weight_kg");
  });
  it("mapApiExerciseToDb écrit intensity_metric (défaut weight_kg)", () => {
    assert.equal((mapApiExerciseToDb({ id: 1, nom_exercice: "Box Jump", intensity_metric: "height_cm" } as any) as any).intensity_metric, "height_cm");
    assert.equal((mapApiExerciseToDb({ id: 1, nom_exercice: "Squat" } as any) as any).intensity_metric, "weight_kg");
  });
  it("normalizeExercise préserve intensity_metric", () => {
    assert.equal(normalizeExercise({ id: 1, nom_exercice: "Box Jump", intensity_metric: "height_cm" }).intensity_metric, "height_cm");
  });
});
