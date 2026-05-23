import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldSkipOneRm } from "@/lib/api/strength";
import { collectEstimated1RMs } from "@/lib/api/transformers";
import { BODYWEIGHT_SENTINEL } from "@/lib/api/client";

describe("shouldSkipOneRm (§298)", () => {
  it("skip si bodyweight sentinel", () => assert.equal(shouldSkipOneRm(BODYWEIGHT_SENTINEL), true));
  it("skip si flag explicite (métrique non-poids)", () => assert.equal(shouldSkipOneRm(60, true), true));
  it("ne skip pas un vrai poids", () => assert.equal(shouldSkipOneRm(75, false), false));
  it("ne skip pas un vrai poids sans flag", () => assert.equal(shouldSkipOneRm(75), false));
});

describe("collectEstimated1RMs — skipExerciseIds (§298)", () => {
  const logs = [
    { exercise_id: 5, weight: 75, reps: 5 },   // Squat (weight_kg)
    { exercise_id: 8, weight: 60, reps: 5 },   // Box Jump (height_cm) → 60cm ≠ charge
  ];

  it("estime le 1RM de tous les exos sans skip set", () => {
    const result = collectEstimated1RMs(logs);
    assert.equal(result.has(5), true);
    assert.equal(result.has(8), true); // bug historique : 60cm devient un 1RM bidon
  });

  it("exclut les exercise_ids non-poids quand fournis (chemins reconcile/replay)", () => {
    const result = collectEstimated1RMs(logs, new Set([8]));
    assert.equal(result.has(5), true);  // Squat conservé
    assert.equal(result.has(8), false); // Box Jump exclu → pas de 1RM fantôme
  });
});
