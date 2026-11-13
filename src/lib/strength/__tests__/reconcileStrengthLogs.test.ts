import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMissingStrengthLogs } from "../reconcileStrengthLogs";

describe("getMissingStrengthLogs — partial writes / offline replay", () => {
  const local = [
    { exercise_id: 10, set_number: 1, reps: 4, weight: 80 },
    { exercise_id: 10, set_number: 2, reps: 4, weight: 82 },
    { exercise_id: 10, set_number: 3, reps: 4, weight: 85 },
  ];

  it("finds a missing middle set instead of slicing by remote count", () => {
    const remote = [
      { exercise_id: 10, set_index: 1 },
      { exercise_id: 10, set_index: 3 },
    ];
    assert.deepEqual(getMissingStrengthLogs(local, remote), [{ log: local[1], setIndex: 2 }]);
  });

  it("does not replay already-saved sets even when remote order differs", () => {
    assert.deepEqual(getMissingStrengthLogs(local, [
      { exercise_id: 10, set_index: 3 },
      { exercise_id: 10, set_index: 1 },
      { exercise_id: 10, set_index: 2 },
    ]), []);
  });

  it("infers legacy local indexes per exercise, not global array index", () => {
    const logs = [
      { exercise_id: 10, reps: 5 },
      { exercise_id: 11, reps: 3 },
      { exercise_id: 10, reps: 5 },
    ];
    const missing = getMissingStrengthLogs(logs, [{ exercise_id: 10, set_index: 1 }]);
    assert.deepEqual(missing.map(({ log, setIndex }) => [log.exercise_id, setIndex]), [[11, 1], [10, 2]]);
  });

  it("rejects two occurrences colliding under the current DB unique index", () => {
    assert.throws(() => getMissingStrengthLogs([
      { exercise_id: 10, set_number: 1 },
      { exercise_id: 10, set_number: 1 },
    ], []), /même identifiant/);
  });

  it("does not mistake unnumbered remote sets for confirmed local writes", () => {
    assert.throws(() => getMissingStrengthLogs(local, [{ exercise_id: 10, set_index: null }]), /sans identifiant fiable/);
  });
});
