// src/lib/__tests__/gifEncoder.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clampTrimRange } from "../gifEncoder";

describe("clampTrimRange", () => {
  it("clamps end to start + MAX_DURATION when range exceeds 5s", () => {
    assert.deepEqual(clampTrimRange(2, 10, 20), [2, 7]);
  });

  it("keeps valid range unchanged", () => {
    assert.deepEqual(clampTrimRange(1, 4, 20), [1, 4]);
  });

  it("clamps end to duration", () => {
    assert.deepEqual(clampTrimRange(18, 25, 20), [18, 20]);
  });

  it("applies both constraints (duration wins)", () => {
    assert.deepEqual(clampTrimRange(18, 30, 20), [18, 20]);
  });

  it("applies both constraints (max duration wins)", () => {
    assert.deepEqual(clampTrimRange(0, 30, 20), [0, 5]);
  });
});
