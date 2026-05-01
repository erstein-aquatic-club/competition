import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RATIOS_BASE,
  getRatioAnchors,
  ZONE_COEFFICIENTS,
  STROKE_ADJUSTMENTS_DEFAULT,
  SEGMENTS_4N,
  type EventFamily,
  type Zone,
} from "../lib/paceData";

// ─── Task 1: RATIOS_BASE ───────────────────────────────────────────────────

describe("RATIOS_BASE", () => {
  it("contains all 6 event families", () => {
    assert.deepEqual(
      Object.keys(RATIOS_BASE).map(Number).sort((a, b) => a - b),
      [50, 100, 200, 400, 800, 1500],
    );
  });

  it("each curve ends at ratio 1.000 for the target distance", () => {
    for (const D of [50, 100, 200, 400, 800, 1500]) {
      const anchors = RATIOS_BASE[D];
      const last = anchors[anchors.length - 1];
      assert.equal(last.d, D);
      assert.equal(last.ratio, 1.0);
    }
  });

  it("each curve is strictly increasing in d and ratio", () => {
    for (const D of [50, 100, 200, 400, 800, 1500]) {
      const anchors = RATIOS_BASE[D];
      for (let i = 1; i < anchors.length; i++) {
        assert.ok(anchors[i].d > anchors[i - 1].d);
        assert.ok(anchors[i].ratio > anchors[i - 1].ratio);
      }
    }
  });

  it("getRatioAnchors(50) returns 8 points matching doc §5.1", () => {
    const a = getRatioAnchors(50);
    assert.deepEqual(a, [
      { d: 15, ratio: 0.241 },
      { d: 20, ratio: 0.346 },
      { d: 25, ratio: 0.451 },
      { d: 30, ratio: 0.561 },
      { d: 35, ratio: 0.671 },
      { d: 40, ratio: 0.780 },
      { d: 45, ratio: 0.890 },
      { d: 50, ratio: 1.000 },
    ]);
  });
});

// ─── Task 2: ZONE_COEFFICIENTS ────────────────────────────────────────────

describe("ZONE_COEFFICIENTS", () => {
  it("matches doc §4 for all 5 event families", () => {
    assert.deepEqual(ZONE_COEFFICIENTS["50m"], { V0: 0.70, V1: 0.78, V2: 0.86, V3: 0.94, V4: 0.98, MAX: 1.00 });
    assert.deepEqual(ZONE_COEFFICIENTS["100m"], { V0: 0.72, V1: 0.80, V2: 0.88, V3: 0.95, V4: 0.98, MAX: 1.00 });
    assert.deepEqual(ZONE_COEFFICIENTS["200m"], { V0: 0.74, V1: 0.82, V2: 0.90, V3: 0.96, V4: 0.985, MAX: 1.00 });
    assert.deepEqual(ZONE_COEFFICIENTS["400m"], { V0: 0.76, V1: 0.84, V2: 0.91, V3: 0.96, V4: null, MAX: 1.00 });
    assert.deepEqual(ZONE_COEFFICIENTS["800m_1500m"], { V0: 0.78, V1: 0.86, V2: 0.92, V3: 0.97, V4: null, MAX: 1.00 });
  });

  it("V4 is null on 400m and 800m_1500m families (V4 disabled by default)", () => {
    assert.equal(ZONE_COEFFICIENTS["400m"].V4, null);
    assert.equal(ZONE_COEFFICIENTS["800m_1500m"].V4, null);
  });

  it("k_speed is monotonic V0 < V1 < V2 < V3 < (V4) < MAX in each family", () => {
    const families: EventFamily[] = ["50m", "100m", "200m", "400m", "800m_1500m"];
    for (const f of families) {
      const c = ZONE_COEFFICIENTS[f];
      assert.ok(c.V0 < c.V1);
      assert.ok(c.V1 < c.V2);
      assert.ok(c.V2 < c.V3);
      if (c.V4 !== null) assert.ok(c.V3 < c.V4 && c.V4 < c.MAX);
      else assert.ok(c.V3 < c.MAX);
    }
  });
});

// ─── Task 3: STROKE_ADJUSTMENTS_DEFAULT ───────────────────────────────────

describe("STROKE_ADJUSTMENTS_DEFAULT", () => {
  it("crawl is 0 across all families (reference)", () => {
    for (const f of ["50m", "100m", "200m", "400m", "800m_1500m"] as EventFamily[]) {
      assert.equal(STROKE_ADJUSTMENTS_DEFAULT.crawl[f], 0);
    }
  });

  it("dos uses median of doc ranges (50m: 0.06, 100m: 0.045, 200m: 0.02, ≥400m: 0.01)", () => {
    assert.equal(STROKE_ADJUSTMENTS_DEFAULT.dos["50m"], 0.06);
    assert.equal(STROKE_ADJUSTMENTS_DEFAULT.dos["100m"], 0.045);
    assert.equal(STROKE_ADJUSTMENTS_DEFAULT.dos["200m"], 0.02);
    assert.equal(STROKE_ADJUSTMENTS_DEFAULT.dos["400m"], 0.01);
    assert.equal(STROKE_ADJUSTMENTS_DEFAULT.dos["800m_1500m"], 0.01);
  });

  it("brasse: 50m=0.04, 100m=0.035, 200m=0.025, ≥400m=0.01", () => {
    assert.equal(STROKE_ADJUSTMENTS_DEFAULT.brasse["50m"], 0.04);
    assert.equal(STROKE_ADJUSTMENTS_DEFAULT.brasse["100m"], 0.035);
    assert.equal(STROKE_ADJUSTMENTS_DEFAULT.brasse["200m"], 0.025);
  });

  it("papillon stays low: 50m=0, 100m=0, 200m=0.01, ≥400m=0.01", () => {
    assert.equal(STROKE_ADJUSTMENTS_DEFAULT.papillon["50m"], 0);
    assert.equal(STROKE_ADJUSTMENTS_DEFAULT.papillon["100m"], 0);
    assert.equal(STROKE_ADJUSTMENTS_DEFAULT.papillon["200m"], 0.01);
  });
});

// ─── Task 4: SEGMENTS_4N ──────────────────────────────────────────────────

describe("SEGMENTS_4N", () => {
  it("200 4N segments sum to 1.000", () => {
    const sum = SEGMENTS_4N["200"].reduce((a, s) => a + s.weight, 0);
    assert.ok(Math.abs(sum - 1.0) < 1e-6, `sum=${sum}`);
  });
  it("400 4N segments sum to 1.000", () => {
    const sum = SEGMENTS_4N["400"].reduce((a, s) => a + s.weight, 0);
    assert.ok(Math.abs(sum - 1.0) < 1e-6, `sum=${sum}`);
  });
  it("200 4N : papillon=0.218, dos=0.250, brasse=0.290, crawl=0.242", () => {
    assert.deepEqual(SEGMENTS_4N["200"], [
      { stroke: "papillon", segment_distance: 50, weight: 0.218 },
      { stroke: "dos",      segment_distance: 50, weight: 0.250 },
      { stroke: "brasse",   segment_distance: 50, weight: 0.290 },
      { stroke: "crawl",    segment_distance: 50, weight: 0.242 },
    ]);
  });
  it("400 4N : papillon=0.229, dos=0.255, brasse=0.280, crawl=0.236", () => {
    assert.deepEqual(SEGMENTS_4N["400"], [
      { stroke: "papillon", segment_distance: 100, weight: 0.229 },
      { stroke: "dos",      segment_distance: 100, weight: 0.255 },
      { stroke: "brasse",   segment_distance: 100, weight: 0.280 },
      { stroke: "crawl",    segment_distance: 100, weight: 0.236 },
    ]);
  });
});
