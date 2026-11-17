import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getUnquantifiedPerformedExercises } from "../unquantifiedPerformedExercises";

describe("getUnquantifiedPerformedExercises", () => {
  it("shows performed pull-over without inventing sets or reps", () => {
    const run = { raw_payload: { unquantified_exercises: [
      { exercise_id: 12, exercise_name: "Pull-over explosif · pattern papillon", performed: true,
        notes: "Séries, répétitions et charge non renseignées" },
    ] } };
    assert.deepEqual(getUnquantifiedPerformedExercises(run, [
      { exercise_id: 9 }, { exercise_id: 121 }, { exercise_id: 110 },
    ]), [{
      exerciseId: 12, name: "Pull-over explosif · pattern papillon",
      notes: "Séries, répétitions et charge non renseignées",
    }]);
  });

  it("does not duplicate an exercise if a real set log later exists", () => {
    const run = { raw_payload: { unquantified_exercises: [
      { exercise_id: 12, exercise_name: "Pull-over", performed: true },
    ] } };
    assert.deepEqual(getUnquantifiedPerformedExercises(run, [{ exercise_id: 12 }]), []);
  });

  it("ignores invalid or not-performed entries", () => {
    const run = { raw_payload: { unquantified_exercises: [
      null, "invalid", { exercise_id: 9, exercise_name: "medball", performed: false },
      { exercise_id: 0, exercise_name: "abs", performed: true },
      { exercise_id: 12, performed: true },
      { exercise_id: 19, exercise_name: "rotation", performed: true },
      { exercise_id: 19, exercise_name: "rotation", performed: true },
    ] } };
    assert.deepEqual(getUnquantifiedPerformedExercises(run, []), [
      { exerciseId: 19, name: "rotation", notes: null },
    ]);
  });

  it("supports older runs without payload", () => {
    assert.deepEqual(getUnquantifiedPerformedExercises({ raw_payload: null }, []), []);
    assert.deepEqual(getUnquantifiedPerformedExercises({ raw_payload: {} }, []), []);
  });
});
