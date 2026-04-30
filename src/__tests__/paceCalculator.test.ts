import { describe, it, expect } from "vitest";
import {
  DEFAULT_ZONES,
  pacePer100m,
  zoneTime,
  getDistanceRows,
  type Stroke,
  type Zone,
  type ZoneConfig,
} from "../lib/paceCalculator";

describe("paceCalculator — types & defaults", () => {
  it("DEFAULT_ZONES has the agreed % values", () => {
    expect(DEFAULT_ZONES).toEqual({
      v0_pct: 140,
      v1_pct: 130,
      v2_pct: 115,
      v3_pct: 110,
      max_pct: 105,
    });
  });

  it("DEFAULT_ZONES respects ordering V0 ≥ V1 ≥ V2 ≥ V3 ≥ Max", () => {
    const z = DEFAULT_ZONES;
    expect(z.v0_pct).toBeGreaterThanOrEqual(z.v1_pct);
    expect(z.v1_pct).toBeGreaterThanOrEqual(z.v2_pct);
    expect(z.v2_pct).toBeGreaterThanOrEqual(z.v3_pct);
    expect(z.v3_pct).toBeGreaterThanOrEqual(z.max_pct);
  });
});

describe("pacePer100m", () => {
  it("100m in 65s → 65 000 ms / 100m", () => {
    expect(pacePer100m(65_000, 100)).toBe(65_000);
  });
  it("200m in 130s → 65 000 ms / 100m", () => {
    expect(pacePer100m(130_000, 200)).toBe(65_000);
  });
  it("50m in 27s → 54 000 ms / 100m", () => {
    expect(pacePer100m(27_000, 50)).toBe(54_000);
  });
  it("throws on non-positive distance", () => {
    expect(() => pacePer100m(60_000, 0)).toThrow();
    expect(() => pacePer100m(60_000, -50)).toThrow();
  });
});

describe("zoneTime", () => {
  it("at 100m on a 65s/100m pace at 105% (Max) → 68 250 ms", () => {
    expect(zoneTime(100, 65_000, 105)).toBe(68_250);
  });
  it("at 50m on a 65s/100m pace at 110% (V3) → 35 750 ms", () => {
    expect(zoneTime(50, 65_000, 110)).toBe(35_750);
  });
  it("at 25m on a 65s/100m pace at 140% (V0) → 22 750 ms", () => {
    expect(zoneTime(25, 65_000, 140)).toBe(22_750);
  });
  it("V0 always > V1 > V2 > V3 > Max in time at any distance", () => {
    const pace = 65_000;
    const t = (p: number) => zoneTime(50, pace, p);
    const z = DEFAULT_ZONES;
    expect(t(z.v0_pct)).toBeGreaterThan(t(z.v1_pct));
    expect(t(z.v1_pct)).toBeGreaterThan(t(z.v2_pct));
    expect(t(z.v2_pct)).toBeGreaterThan(t(z.v3_pct));
    expect(t(z.v3_pct)).toBeGreaterThan(t(z.max_pct));
  });
});

describe("getDistanceRows", () => {
  // Single-stroke events (NL/Dos/Brasse/Pap)
  it.each([
    [50,   ["NL", "Dos", "Brasse", "Pap"], [15, 20, 25, 50]],
    [100,  ["NL", "Dos", "Brasse", "Pap"], [15, 25, 50, 75, 100]],
    [200,  ["NL", "Dos", "Brasse", "Pap"], [25, 50, 100, 150, 200]],
    [400,  ["NL"],                          [50, 100, 200, 300, 400]],
    [800,  ["NL"],                          [100, 200, 400, 600, 800]],
    [1500, ["NL"],                          [100, 200, 400, 800, 1200, 1500]],
  ])("distance %i for %j strokes returns %j", (dist, strokes, expected) => {
    for (const stroke of strokes as Array<"NL"|"Dos"|"Brasse"|"Pap">) {
      expect(getDistanceRows(dist as number, stroke)).toEqual(expected);
    }
  });

  // 4N
  it.each([
    [100, [25, 50, 75, 100]],
    [200, [50, 100, 150, 200]],
    [400, [100, 200, 300, 400]],
  ])("4N distance %i returns %j", (dist, expected) => {
    expect(getDistanceRows(dist as number, "4N")).toEqual(expected);
  });

  it("returns empty array for unsupported (distance, stroke) combo", () => {
    expect(getDistanceRows(50, "4N")).toEqual([]);
    expect(getDistanceRows(800, "Brasse")).toEqual([]);
  });
});

import { formatPaceTime, parsePaceTime } from "../lib/paceCalculator";

describe("formatPaceTime", () => {
  it("under 1 min → ss.x", () => {
    expect(formatPaceTime(45_500)).toBe("45.5");
    expect(formatPaceTime(8_300)).toBe("8.3");
  });
  it("≥ 1 min → m:ss.x with zero-padded seconds", () => {
    expect(formatPaceTime(65_400)).toBe("1:05.4");
    expect(formatPaceTime(125_900)).toBe("2:05.9");
    expect(formatPaceTime(600_000)).toBe("10:00.0");
  });
  it("rounds half-up to nearest 100 ms", () => {
    expect(formatPaceTime(65_449)).toBe("1:05.4");
    expect(formatPaceTime(65_450)).toBe("1:05.5");
  });
});

describe("parsePaceTime", () => {
  it.each([
    ["1:05",     65_000],
    ["1:05.4",   65_400],
    ["01:05.40", 65_400],
    ["65.4",     65_400],
    ["65",       65_000],
    [" 1:05.4 ", 65_400],
  ])("parses %s → %i ms", (s, ms) => {
    expect(parsePaceTime(s)).toBe(ms);
  });

  it("returns null on invalid input", () => {
    expect(parsePaceTime("")).toBeNull();
    expect(parsePaceTime("abc")).toBeNull();
    expect(parsePaceTime("1:60")).toBeNull();
    expect(parsePaceTime("-1")).toBeNull();
  });
});
