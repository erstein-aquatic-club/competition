import test from "node:test";
import assert from "node:assert/strict";
import { needsOneRmCalibration, isOneRmEligible } from "../oneRmCalibration.ts";

const base = { setIndex: 1, percent1rm: 70, metric: "weight_kg", isBodyweight: false, hasOneRm: false, oneRmEligible: true };

test("éligible : %1RM + weight_kg + non-PDC + sans 1RM, série 1", () => {
  assert.equal(needsOneRmCalibration(base), true);
});
test("PAS éligible : exo sans %1RM (accessoire/reps)", () => {
  assert.equal(needsOneRmCalibration({ ...base, percent1rm: 0 }), false);
});
test("PAS éligible : poids de corps (PDC)", () => {
  assert.equal(needsOneRmCalibration({ ...base, isBodyweight: true }), false);
});
test("PAS éligible : métrique non-poids (height_cm/time_s, §298)", () => {
  assert.equal(needsOneRmCalibration({ ...base, metric: "height_cm" }), false);
});
test("PAS éligible : 1RM déjà connu", () => {
  assert.equal(needsOneRmCalibration({ ...base, hasOneRm: true }), false);
});
test("PAS éligible : pas la série 1", () => {
  assert.equal(needsOneRmCalibration({ ...base, setIndex: 2 }), false);
});

test("aucun prompt lorsque la classification est absente, fausse ou non éligible", () => {
  for (const input of [
    { ...base, oneRmEligible: false },
    { ...base, hasOneRm: true },
    { ...base, isBodyweight: true },
    { ...base, metric: "time_s" },
  ]) assert.equal(needsOneRmCalibration(input), false);
});

test("éligibilité explicite : saut et poids du corps exclus même si %1RM existe", () => {
  const loaded = { id: 1, nom_exercice: "Squat", exercise_type: "strength" as const, intensity_metric: "weight_kg" as const, is_bodyweight: false, one_rm_eligible: true };
  assert.equal(isOneRmEligible(loaded), true);
  assert.equal(isOneRmEligible({ ...loaded, one_rm_eligible: false, nom_exercice: "Depth Jump" }), false);
  assert.equal(isOneRmEligible({ ...loaded, is_bodyweight: true }), false);
  assert.equal(isOneRmEligible({ ...loaded, intensity_metric: "height_cm" }), false);
  assert.equal(isOneRmEligible({ ...loaded, exercise_type: "warmup" }), false);
  assert.equal(isOneRmEligible({ ...loaded, one_rm_eligible: undefined }), false);
  assert.equal(isOneRmEligible(undefined), false);
});
