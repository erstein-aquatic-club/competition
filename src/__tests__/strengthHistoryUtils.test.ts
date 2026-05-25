import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
    assert.equal(computeRunTonnage(logs), 80 * 10 + 85 * 8 + 90 * 6);
  });

  it("ignores logs with null weight or reps", () => {
    const logs = makeLogs([
      { weight: 80, reps: 10 },
      { weight: null, reps: 8 },
      { weight: 60, reps: null },
    ]);
    assert.equal(computeRunTonnage(logs), 800);
  });

  it("returns 0 for empty logs", () => {
    assert.equal(computeRunTonnage([]), 0);
  });
});

describe("computeRunTotalReps", () => {
  it("sums reps", () => {
    const logs = makeLogs([{ reps: 10 }, { reps: 8 }, { reps: 6 }]);
    assert.equal(computeRunTotalReps(logs), 24);
  });

  it("skips null reps", () => {
    const logs = makeLogs([{ reps: 10 }, { reps: null }]);
    assert.equal(computeRunTotalReps(logs), 10);
  });
});

describe("computeRunSRPE", () => {
  it("uses run rpe * duration when available", () => {
    assert.equal(computeRunSRPE(7, 45), 315);
  });

  it("returns 0 when rpe is null", () => {
    assert.equal(computeRunSRPE(null, 45), 0);
  });

  it("returns 0 when duration is null", () => {
    assert.equal(computeRunSRPE(7, null), 0);
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
    assert.equal((groups).length, 2);
    assert.equal(groups[0].exerciseId, 1);
    assert.equal(groups[0].exerciseName, "Squat");
    assert.equal((groups[0].sets).length, 2);
    assert.equal(groups[1].exerciseId, 2);
    assert.equal((groups[1].sets).length, 2);
  });

  it("computes volume and maxWeight per group", () => {
    const logs = makeLogs([
      { exercise_id: 1, weight: 80, reps: 10 },
      { exercise_id: 1, weight: 90, reps: 6 },
    ]);
    const groups = groupLogsByExercise(logs, new Map([[1, "Squat"]]));
    assert.equal(groups[0].volume, 80 * 10 + 90 * 6);
    assert.equal(groups[0].maxWeight, 90);
  });

  it("uses fallback name when exercise not in map", () => {
    const logs = makeLogs([{ exercise_id: 99, weight: 50, reps: 10 }]);
    const groups = groupLogsByExercise(logs, new Map());
    assert.equal(groups[0].exerciseName, "Exercice #99");
  });
});

describe("computeAvgDifficulty", () => {
  it("averages difficulty values", () => {
    const logs = makeLogs([{ difficulty: 3 }, { difficulty: 5 }, { difficulty: 4 }]);
    assert.equal(computeAvgDifficulty(logs), 4);
  });

  it("skips null difficulty", () => {
    const logs = makeLogs([{ difficulty: 3 }, { difficulty: null }, { difficulty: 5 }]);
    assert.equal(computeAvgDifficulty(logs), 4);
  });

  it("returns 0 for no difficulty data", () => {
    assert.equal(computeAvgDifficulty([]), 0);
  });
});
