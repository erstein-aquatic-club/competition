import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getPoolMajorationMs,
  convertTargetTime,
} from "../lib/poolConversion";

describe("getPoolMajorationMs", () => {
  it("100 NL F → 1200 ms", () => {
    assert.equal(getPoolMajorationMs("NL", 100, "F"), 1200);
  });

  it("100 NL M → 1500 ms", () => {
    assert.equal(getPoolMajorationMs("NL", 100, "M"), 1500);
  });

  it("1500 NL M → 30100 ms", () => {
    assert.equal(getPoolMajorationMs("NL", 1500, "M"), 30100);
  });

  it("100 4N (hors table) → null", () => {
    assert.equal(getPoolMajorationMs("4N", 100, "M"), null);
  });

  it("50 4N (hors table) → null", () => {
    assert.equal(getPoolMajorationMs("4N", 50, "M"), null);
  });
});

describe("convertTargetTime — no-op", () => {
  it("50m → 50m returns targetTimeMs unchanged", () => {
    const result = convertTargetTime({
      targetTimeMs: 60_000,
      fromPool: "50m",
      toPool: "50m",
      stroke: "NL",
      distanceM: 100,
      sex: "M",
    });
    assert.equal(result, 60_000);
  });

  it("25m → 25m returns targetTimeMs unchanged", () => {
    const result = convertTargetTime({
      targetTimeMs: 58_500,
      fromPool: "25m",
      toPool: "25m",
      stroke: "NL",
      distanceM: 100,
      sex: "M",
    });
    assert.equal(result, 58_500);
  });
});

describe("convertTargetTime — 50m → 25m", () => {
  it("100 NL Dame : 1:00.00 (50m) → 58.80s (25m)", () => {
    const result = convertTargetTime({
      targetTimeMs: 60_000,
      fromPool: "50m",
      toPool: "25m",
      stroke: "NL",
      distanceM: 100,
      sex: "F",
    });
    // 60000 − 1200 = 58800ms = 58.80s
    assert.equal(result, 58_800);
  });

  it("100 NL Monsieur : 1:00.00 (50m) → 58.50s (25m)", () => {
    const result = convertTargetTime({
      targetTimeMs: 60_000,
      fromPool: "50m",
      toPool: "25m",
      stroke: "NL",
      distanceM: 100,
      sex: "M",
    });
    // 60000 − 1500 = 58500ms
    assert.equal(result, 58_500);
  });

  it("1500 NL Monsieur : 16:00.00 (50m) → 15:29.90 (25m)", () => {
    const result = convertTargetTime({
      targetTimeMs: 16 * 60 * 1000,       // 960000ms
      fromPool: "50m",
      toPool: "25m",
      stroke: "NL",
      distanceM: 1500,
      sex: "M",
    });
    // 960000 − 30100 = 929900ms = 15m 29.9s
    assert.equal(result, 929_900);
  });
});

describe("convertTargetTime — 25m → 50m", () => {
  it("100 NL Monsieur : 58.50s (25m) → 1:00.00 (50m)", () => {
    const result = convertTargetTime({
      targetTimeMs: 58_500,
      fromPool: "25m",
      toPool: "50m",
      stroke: "NL",
      distanceM: 100,
      sex: "M",
    });
    assert.equal(result, 60_000);
  });
});

describe("convertTargetTime — round-trip", () => {
  it("50→25→50 retombe sur le temps de départ (NL 200m M)", () => {
    const original = 120_000; // 2:00.00
    const to25 = convertTargetTime({
      targetTimeMs: original, fromPool: "50m", toPool: "25m",
      stroke: "NL", distanceM: 200, sex: "M",
    });
    assert.ok(to25 !== null);
    const backTo50 = convertTargetTime({
      targetTimeMs: to25!, fromPool: "25m", toPool: "50m",
      stroke: "NL", distanceM: 200, sex: "M",
    });
    assert.equal(backTo50, original);
  });

  it("50→25→50 retombe sur le temps de départ (Dos 100m F)", () => {
    const original = 75_000;
    const to25 = convertTargetTime({
      targetTimeMs: original, fromPool: "50m", toPool: "25m",
      stroke: "Dos", distanceM: 100, sex: "F",
    });
    assert.ok(to25 !== null);
    const backTo50 = convertTargetTime({
      targetTimeMs: to25!, fromPool: "25m", toPool: "50m",
      stroke: "Dos", distanceM: 100, sex: "F",
    });
    assert.equal(backTo50, original);
  });
});

describe("convertTargetTime — null cases", () => {
  it("100 4N (hors table) → null", () => {
    const result = convertTargetTime({
      targetTimeMs: 60_000, fromPool: "50m", toPool: "25m",
      stroke: "4N", distanceM: 100, sex: "M",
    });
    assert.equal(result, null);
  });

  it("sex undefined → null", () => {
    const result = convertTargetTime({
      targetTimeMs: 60_000, fromPool: "50m", toPool: "25m",
      stroke: "NL", distanceM: 100, sex: undefined,
    });
    assert.equal(result, null);
  });

  it("sex null → null", () => {
    const result = convertTargetTime({
      targetTimeMs: 60_000, fromPool: "50m", toPool: "25m",
      stroke: "NL", distanceM: 100, sex: null,
    });
    assert.equal(result, null);
  });
});
