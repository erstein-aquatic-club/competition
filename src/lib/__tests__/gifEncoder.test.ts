// src/lib/__tests__/gifEncoder.test.ts
import { describe, it, expect } from "vitest";
import { clampTrimRange } from "../gifEncoder";

describe("clampTrimRange", () => {
  it("clamps end to start + MAX_DURATION when range exceeds 5s", () => {
    expect(clampTrimRange(2, 10, 20)).toEqual([2, 7]);
  });

  it("keeps valid range unchanged", () => {
    expect(clampTrimRange(1, 4, 20)).toEqual([1, 4]);
  });

  it("clamps end to duration", () => {
    expect(clampTrimRange(18, 25, 20)).toEqual([18, 20]);
  });

  it("applies both constraints (duration wins)", () => {
    expect(clampTrimRange(18, 30, 20)).toEqual([18, 20]);
  });

  it("applies both constraints (max duration wins)", () => {
    expect(clampTrimRange(0, 30, 20)).toEqual([0, 5]);
  });
});
