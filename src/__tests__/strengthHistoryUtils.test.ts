import { describe, it, expect } from "vitest";
import {
  computeRunTonnage,
  computeRunTotalReps,
  computeRunSRPE,
  groupLogsByExercise,
  computeAvgDifficulty,
} from "../lib/strengthHistoryUtils";
import type { SetLogEntry } from "../lib/types";

const makeLogs = (entries: Partial<SetLogEntry>[]): SetLogEntry[] =>
  entries.map((e, i) => ({ exercise_id: e.exercise_id ?? 1, set_index: i, ...e }));

describe("computeRunTonnage", () => {
  it("sums weight * reps for all logs", () => {
    const logs = makeLogs([
      { weight: 80, reps: 10 },
      { weight: 85, reps: 8 },
      { weight: 90, reps: 6 },
    ]);
    expect(computeRunTonnage(logs)).toBe(80 * 10 + 85 * 8 + 90 * 6);
  });

  it("ignores logs with null weight or reps", () => {
    const logs = makeLogs([
      { weight: 80, reps: 10 },
      { weight: null, reps: 8 },
      { weight: 60, reps: null },
    ]);
    expect(computeRunTonnage(logs)).toBe(800);
  });

  it("returns 0 for empty logs", () => {
    expect(computeRunTonnage([])).toBe(0);
  });
});

describe("computeRunTotalReps", () => {
  it("sums reps", () => {
    const logs = makeLogs([{ reps: 10 }, { reps: 8 }, { reps: 6 }]);
    expect(computeRunTotalReps(logs)).toBe(24);
  });

  it("skips null reps", () => {
    const logs = makeLogs([{ reps: 10 }, { reps: null }]);
    expect(computeRunTotalReps(logs)).toBe(10);
  });
});

describe("computeRunSRPE", () => {
  it("uses run rpe * duration when available", () => {
    expect(computeRunSRPE(7, 45)).toBe(315);
  });

  it("returns 0 when rpe is null", () => {
    expect(computeRunSRPE(null, 45)).toBe(0);
  });

  it("returns 0 when duration is null", () => {
    expect(computeRunSRPE(7, null)).toBe(0);
  });
});

describe("groupLogsByExercise", () => {
  it("groups logs by exercise_id preserving order", () => {
    const logs = makeLogs([
      { exercise_id: 1, weight: 80, reps: 10 },
      { exercise_id: 1, weight: 85, reps: 8 },
      { exercise_id: 2, weight: 40, reps: 12 },
      { exercise_id: 2, weight: 45, reps: 10 },
    ]);
    const exerciseMap = new Map([
      [1, "Squat"],
      [2, "Curl"],
    ]);
    const groups = groupLogsByExercise(logs, exerciseMap);
    expect(groups).toHaveLength(2);
    expect(groups[0].exerciseId).toBe(1);
    expect(groups[0].exerciseName).toBe("Squat");
    expect(groups[0].sets).toHaveLength(2);
    expect(groups[1].exerciseId).toBe(2);
    expect(groups[1].sets).toHaveLength(2);
  });

  it("computes volume and maxWeight per group", () => {
    const logs = makeLogs([
      { exercise_id: 1, weight: 80, reps: 10 },
      { exercise_id: 1, weight: 90, reps: 6 },
    ]);
    const groups = groupLogsByExercise(logs, new Map([[1, "Squat"]]));
    expect(groups[0].volume).toBe(80 * 10 + 90 * 6);
    expect(groups[0].maxWeight).toBe(90);
  });

  it("uses fallback name when exercise not in map", () => {
    const logs = makeLogs([{ exercise_id: 99, weight: 50, reps: 10 }]);
    const groups = groupLogsByExercise(logs, new Map());
    expect(groups[0].exerciseName).toBe("Exercice #99");
  });
});

describe("computeAvgDifficulty", () => {
  it("averages difficulty values", () => {
    const logs = makeLogs([{ difficulty: 3 }, { difficulty: 5 }, { difficulty: 4 }]);
    expect(computeAvgDifficulty(logs)).toBe(4);
  });

  it("skips null difficulty", () => {
    const logs = makeLogs([{ difficulty: 3 }, { difficulty: null }, { difficulty: 5 }]);
    expect(computeAvgDifficulty(logs)).toBe(4);
  });

  it("returns 0 for no difficulty data", () => {
    expect(computeAvgDifficulty([])).toBe(0);
  });
});
