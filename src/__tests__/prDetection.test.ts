import { describe, it, expect } from "vitest";
import { estimateOneRM, detectPR } from "../lib/prDetection";

describe("estimateOneRM", () => {
  it("calculates Epley formula correctly for 100kg x 5 reps", () => {
    // 100 * (1 + 5/30) = 100 * 1.1667 = 116.7
    expect(estimateOneRM(100, 5)).toBeCloseTo(116.7, 1);
  });

  it("returns the weight itself for 1 rep", () => {
    expect(estimateOneRM(100, 1)).toBe(100);
  });

  it("returns 0 for zero weight", () => {
    expect(estimateOneRM(0, 5)).toBe(0);
  });

  it("returns 0 for zero reps", () => {
    expect(estimateOneRM(80, 0)).toBe(0);
  });

  it("returns 0 for negative weight", () => {
    expect(estimateOneRM(-10, 5)).toBe(0);
  });

  it("returns 0 for negative reps", () => {
    expect(estimateOneRM(100, -3)).toBe(0);
  });

  it("calculates correctly for 60kg x 10 reps", () => {
    // 60 * (1 + 10/30) = 60 * 1.3333 = 80.0
    expect(estimateOneRM(60, 10)).toBeCloseTo(80.0, 1);
  });
});

describe("detectPR", () => {
  it("detects a new PR when estimated 1RM exceeds previous best", () => {
    const result = detectPR({ weight: 100, reps: 5 }, 110, "Squat");
    expect(result).not.toBeNull();
    expect(result!.type).toBe("estimated_1rm");
    expect(result!.exerciseName).toBe("Squat");
    expect(result!.newValue).toBeCloseTo(116.7, 1);
    expect(result!.previousValue).toBe(110);
    expect(result!.improvement).toBeGreaterThan(0);
  });

  it("returns null when estimated 1RM does not beat previous best", () => {
    const result = detectPR({ weight: 80, reps: 5 }, 110, "Squat");
    expect(result).toBeNull();
  });

  it("returns null when previous best is 0 (no history)", () => {
    const result = detectPR({ weight: 100, reps: 5 }, 0, "Squat");
    expect(result).toBeNull();
  });

  it("returns null when weight is 0", () => {
    const result = detectPR({ weight: 0, reps: 5 }, 100, "Squat");
    expect(result).toBeNull();
  });

  it("returns null when reps is 0", () => {
    const result = detectPR({ weight: 100, reps: 0 }, 80, "Squat");
    expect(result).toBeNull();
  });

  it("calculates improvement percentage correctly", () => {
    // 100kg x 1 rep = 100 1RM vs previous 80 → 25% improvement
    const result = detectPR({ weight: 100, reps: 1 }, 80, "Bench Press");
    expect(result).not.toBeNull();
    expect(result!.improvement).toBe(25);
  });

  it("returns null when estimated 1RM equals previous best exactly", () => {
    // 100kg x 1 rep = 100 1RM, previous = 100 → not a PR (must be strictly greater)
    const result = detectPR({ weight: 100, reps: 1 }, 100, "Deadlift");
    expect(result).toBeNull();
  });
});
