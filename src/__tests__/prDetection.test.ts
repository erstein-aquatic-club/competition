import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estimateOneRM, detectPR } from "../lib/prDetection";

/** Égalité à tolérance pour les comparaisons en virgule flottante. */
const close = (actual: number, expected: number, digits = 1): void => {
  const tol = 0.5 * Math.pow(10, -digits);
  assert.ok(
    Math.abs(actual - expected) < tol,
    `attendu ≈ ${expected} (±${tol}), obtenu ${actual}`,
  );
};

describe("estimateOneRM", () => {
  it("calculates Epley formula correctly for 100kg x 5 reps", () => {
    // 100 * (1 + 5/30) = 100 * 1.1667 = 116.7
    close(estimateOneRM(100, 5), 116.7, 1);
  });

  it("returns the weight itself for 1 rep", () => {
    assert.equal(estimateOneRM(100, 1), 100);
  });

  it("returns 0 for zero weight", () => {
    assert.equal(estimateOneRM(0, 5), 0);
  });

  it("returns 0 for zero reps", () => {
    assert.equal(estimateOneRM(80, 0), 0);
  });

  it("returns 0 for negative weight", () => {
    assert.equal(estimateOneRM(-10, 5), 0);
  });

  it("returns 0 for negative reps", () => {
    assert.equal(estimateOneRM(100, -3), 0);
  });

  it("calculates correctly for 60kg x 10 reps", () => {
    // 60 * (1 + 10/30) = 60 * 1.3333 = 80.0
    close(estimateOneRM(60, 10), 80.0, 1);
  });

  it("difficulty 5 gives same result as no difficulty (at failure = RIR 0)", () => {
    close(estimateOneRM(100, 5, 5), estimateOneRM(100, 5), 1);
  });

  it("difficulty 3 adds 3 RIR — higher estimate than at-failure", () => {
    // effectiveReps = 5 + 3 = 8 → 100 * (1 + 8/30) = 126.7
    close(estimateOneRM(100, 5, 3), 126.7, 1);
    assert.ok(estimateOneRM(100, 5, 3) > estimateOneRM(100, 5, 5));
  });

  it("difficulty 1 adds 5 RIR — highest estimate", () => {
    // effectiveReps = 5 + 5 = 10 → 100 * (1 + 10/30) = 133.3
    close(estimateOneRM(100, 5, 1), 133.3, 1);
    assert.ok(estimateOneRM(100, 5, 1) > estimateOneRM(100, 5, 3));
  });

  it("null difficulty falls back to RIR 0 (conservative)", () => {
    close(estimateOneRM(100, 5, null), estimateOneRM(100, 5), 1);
  });

  it("RIR explicite prime sur la difficulté", () => {
    // 60 kg × 5 reps, RIR 2 → effectiveReps 7 → 60*(1+7/30)=74
    assert.equal(estimateOneRM(60, 5, { rir: 2 }), 74);
  });

  it("RIR explicite 0 = à l'échec (effectiveReps = reps)", () => {
    // 100 kg × 1 rep, RIR 0 → 100
    assert.equal(estimateOneRM(100, 1, { rir: 0 }), 100);
  });

  it("rétrocompat — 3e arg numérique reste interprété comme difficulté", () => {
    // difficulté 3 → RIR 3 ; 60×5 → effectiveReps 8 → 60*(1+8/30)=76
    assert.equal(estimateOneRM(60, 5, 3), 76);
  });
});

describe("detectPR", () => {
  it("detects a new PR when estimated 1RM exceeds previous best", () => {
    const result = detectPR({ weight: 100, reps: 5 }, 110, "Squat");
    assert.notEqual(result, null);
    assert.equal(result!.type, "estimated_1rm");
    assert.equal(result!.exerciseName, "Squat");
    close(result!.newValue, 116.7, 1);
    assert.equal(result!.previousValue, 110);
    assert.ok(result!.improvement > 0);
  });

  it("returns null when estimated 1RM does not beat previous best", () => {
    const result = detectPR({ weight: 80, reps: 5 }, 110, "Squat");
    assert.equal(result, null);
  });

  it("returns null when previous best is 0 (no history)", () => {
    const result = detectPR({ weight: 100, reps: 5 }, 0, "Squat");
    assert.equal(result, null);
  });

  it("returns null when weight is 0", () => {
    const result = detectPR({ weight: 0, reps: 5 }, 100, "Squat");
    assert.equal(result, null);
  });

  it("returns null when reps is 0", () => {
    const result = detectPR({ weight: 100, reps: 0 }, 80, "Squat");
    assert.equal(result, null);
  });

  it("calculates improvement percentage correctly", () => {
    // 100kg x 1 rep = 100 1RM vs previous 80 → 25% improvement
    const result = detectPR({ weight: 100, reps: 1 }, 80, "Bench Press");
    assert.notEqual(result, null);
    assert.equal(result!.improvement, 25);
  });

  it("returns null when estimated 1RM equals previous best exactly", () => {
    // 100kg x 1 rep = 100 1RM, previous = 100 → not a PR (must be strictly greater)
    const result = detectPR({ weight: 100, reps: 1 }, 100, "Deadlift");
    assert.equal(result, null);
  });
});
