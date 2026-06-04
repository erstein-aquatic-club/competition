import test from "node:test";
import assert from "node:assert/strict";
import { needsOneRmCalibration } from "../oneRmCalibration.ts";

const base = { setIndex: 1, percent1rm: 70, metric: "weight_kg", isBodyweight: false, hasOneRm: false };

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
