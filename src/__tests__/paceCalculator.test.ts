import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ZONES,
  pacePer100m,
  zoneTime,
  getDistanceRows,
  formatPaceTime,
  parsePaceTime,
  type Stroke,
  type Zone,
  type ZoneConfig,
} from "../lib/paceCalculator";

describe("paceCalculator — types & defaults", () => {
  it("DEFAULT_ZONES has the agreed % values", () => {
    assert.deepEqual(DEFAULT_ZONES, {
      v0_pct: 140,
      v1_pct: 130,
      v2_pct: 115,
      v3_pct: 110,
      max_pct: 105,
    });
  });

  it("DEFAULT_ZONES respects ordering V0 ≥ V1 ≥ V2 ≥ V3 ≥ Max", () => {
    const z = DEFAULT_ZONES;
    assert.ok(z.v0_pct >= z.v1_pct);
    assert.ok(z.v1_pct >= z.v2_pct);
    assert.ok(z.v2_pct >= z.v3_pct);
    assert.ok(z.v3_pct >= z.max_pct);
  });
});

describe("pacePer100m", () => {
  it("100m in 65s → 65 000 ms / 100m", () => {
    assert.equal(pacePer100m(65_000, 100), 65_000);
  });
  it("200m in 130s → 65 000 ms / 100m", () => {
    assert.equal(pacePer100m(130_000, 200), 65_000);
  });
  it("50m in 27s → 54 000 ms / 100m", () => {
    assert.equal(pacePer100m(27_000, 50), 54_000);
  });
  it("throws on non-positive distance", () => {
    assert.throws(() => pacePer100m(60_000, 0));
    assert.throws(() => pacePer100m(60_000, -50));
  });
});

describe("zoneTime", () => {
  it("at 100m on a 65s/100m pace at 105% (Max) → 68 250 ms", () => {
    assert.equal(zoneTime(100, 65_000, 105), 68_250);
  });
  it("at 50m on a 65s/100m pace at 110% (V3) → 35 750 ms", () => {
    assert.equal(zoneTime(50, 65_000, 110), 35_750);
  });
  it("at 25m on a 65s/100m pace at 140% (V0) → 22 750 ms", () => {
    assert.equal(zoneTime(25, 65_000, 140), 22_750);
  });
  it("V0 always > V1 > V2 > V3 > Max in time at any distance", () => {
    const pace = 65_000;
    const t = (p: number) => zoneTime(50, pace, p);
    const z = DEFAULT_ZONES;
    assert.ok(t(z.v0_pct) > t(z.v1_pct));
    assert.ok(t(z.v1_pct) > t(z.v2_pct));
    assert.ok(t(z.v2_pct) > t(z.v3_pct));
    assert.ok(t(z.v3_pct) > t(z.max_pct));
  });
});

describe("getDistanceRows", () => {
  // Single-stroke events (NL/Dos/Brasse/Pap)
  const singleStrokeCases: Array<[number, string[], number[]]> = [
    [50, ["NL", "Dos", "Brasse", "Pap"], [15, 20, 25, 50]],
    [100, ["NL", "Dos", "Brasse", "Pap"], [15, 25, 50, 75, 100]],
    [200, ["NL", "Dos", "Brasse", "Pap"], [25, 50, 100, 150, 200]],
    [400, ["NL"], [50, 100, 200, 300, 400]],
    [800, ["NL"], [100, 200, 400, 600, 800]],
    [1500, ["NL"], [100, 200, 400, 800, 1200, 1500]],
  ];
  for (const [dist, strokes, expected] of singleStrokeCases) {
    it(`distance ${dist} for ${JSON.stringify(strokes)} strokes returns ${JSON.stringify(expected)}`, () => {
      for (const stroke of strokes as Array<"NL" | "Dos" | "Brasse" | "Pap">) {
        assert.deepEqual(getDistanceRows(dist, stroke), expected);
      }
    });
  }

  // 4N
  const medleyCases: Array<[number, number[]]> = [
    [100, [25, 50, 75, 100]],
    [200, [50, 100, 150, 200]],
    [400, [100, 200, 300, 400]],
  ];
  for (const [dist, expected] of medleyCases) {
    it(`4N distance ${dist} returns ${JSON.stringify(expected)}`, () => {
      assert.deepEqual(getDistanceRows(dist, "4N"), expected);
    });
  }

  it("returns empty array for unsupported (distance, stroke) combo", () => {
    assert.deepEqual(getDistanceRows(50, "4N"), []);
    assert.deepEqual(getDistanceRows(800, "Brasse"), []);
  });
});

describe("formatPaceTime", () => {
  it("under 1 min → ss.x", () => {
    assert.equal(formatPaceTime(45_500), "45.5");
    assert.equal(formatPaceTime(8_300), "8.3");
  });
  it("≥ 1 min → m:ss.x with zero-padded seconds", () => {
    assert.equal(formatPaceTime(65_400), "1:05.4");
    assert.equal(formatPaceTime(125_900), "2:05.9");
    assert.equal(formatPaceTime(600_000), "10:00.0");
  });
  it("rounds half-up to nearest 100 ms", () => {
    assert.equal(formatPaceTime(65_449), "1:05.4");
    assert.equal(formatPaceTime(65_450), "1:05.5");
  });
});

describe("parsePaceTime", () => {
  const parseCases: Array<[string, number]> = [
    ["1:05", 65_000],
    ["1:05.4", 65_400],
    ["01:05.40", 65_400],
    ["65.4", 65_400],
    ["65", 65_000],
    [" 1:05.4 ", 65_400],
  ];
  for (const [s, ms] of parseCases) {
    it(`parses ${s} → ${ms} ms`, () => {
      assert.equal(parsePaceTime(s), ms);
    });
  }

  it("returns null on invalid input", () => {
    assert.equal(parsePaceTime(""), null);
    assert.equal(parsePaceTime("abc"), null);
    assert.equal(parsePaceTime("1:60"), null);
    assert.equal(parsePaceTime("-1"), null);
  });
});
