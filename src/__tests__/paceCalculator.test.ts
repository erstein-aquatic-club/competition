import { describe, it, expect } from "vitest";
import {
  DEFAULT_ZONES,
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
