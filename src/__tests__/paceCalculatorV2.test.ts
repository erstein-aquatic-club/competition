import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  eventFamily,
  normalizeStroke,
  getRatio,
  strokeAdjustment,
  computeTMax,
  computeZoneTime,
  compute4NSegment,
  compute4NCumulative,
  getDistanceRowsV2,
  validateMatrix,
} from "../lib/paceCalculatorV2";

// ─── Task 5: eventFamily + normalizeStroke ────────────────────────────────

describe("eventFamily", () => {
  for (const [D, expected] of [
    [50, "50m"], [100, "100m"], [200, "200m"],
    [400, "400m"], [800, "800m_1500m"], [1500, "800m_1500m"],
  ] as const) {
    it(`maps D=${D} to ${expected}`, () => {
      assert.equal(eventFamily(D), expected);
    });
  }
  it("throws on unsupported distance", () => {
    assert.throws(() => eventFamily(150), /Unsupported event distance/);
  });
});

describe("normalizeStroke", () => {
  it("maps NL to crawl", () => assert.equal(normalizeStroke("NL"), "crawl"));
  it("maps Pap to papillon", () => assert.equal(normalizeStroke("Pap"), "papillon"));
  it("maps Dos to dos (lowercased)", () => assert.equal(normalizeStroke("Dos"), "dos"));
  it("maps Brasse to brasse", () => assert.equal(normalizeStroke("Brasse"), "brasse"));
  it("passes 4N through", () => assert.equal(normalizeStroke("4N"), "4N"));
  it("passes already-normalized values", () => assert.equal(normalizeStroke("crawl"), "crawl"));
  it("throws on unknown stroke", () => assert.throws(() => normalizeStroke("NAC")));
});

// ─── Task 6: getRatio — log-linear interpolation ──────────────────────────

describe("getRatio (with log-linear interpolation)", () => {
  it("returns exact value for anchor distances", () => {
    assert.equal(getRatio(100, 50), 0.470);
    assert.equal(getRatio(100, 75), 0.735);
    assert.equal(getRatio(50, 25), 0.451);
  });

  it("interpolates 65m on 100m curve via log-linear", () => {
    // R = R1 × (R2/R1)^((d-d1)/(d2-d1))
    // R1=0.470 (50m), R2=0.735 (75m), d=65 → exp=15/25=0.6 → R≈0.6147
    const r = getRatio(100, 65);
    assert.ok(Math.abs(r - 0.6147) < 0.0005, `got ${r}`);
  });

  it("returns 1.000 at the target distance", () => {
    assert.equal(getRatio(50, 50), 1.000);
    assert.equal(getRatio(1500, 1500), 1.000);
  });

  it("throws on extrapolation below smallest anchor", () => {
    assert.throws(() => getRatio(50, 10), /below smallest anchor/);
  });

  it("throws on extrapolation above target distance", () => {
    assert.throws(() => getRatio(100, 150), /above target distance/);
  });
});

// ─── Task 7: strokeAdjustment ─────────────────────────────────────────────

describe("strokeAdjustment", () => {
  it("returns 1 at d = D (Tobj is conserved)", () => {
    assert.equal(strokeAdjustment(50, 50, "dos"), 1);
    assert.equal(strokeAdjustment(100, 100, "brasse"), 1);
    assert.equal(strokeAdjustment(400, 400, "papillon"), 1);
  });

  it("returns 1 for crawl at any distance (reference)", () => {
    assert.equal(strokeAdjustment(50, 25, "crawl"), 1);
    assert.equal(strokeAdjustment(200, 100, "crawl"), 1);
  });

  it("dos 50m at d=25 : 1 + 0.06 × (1 - 25/50)² = 1 + 0.06 × 0.25 = 1.015", () => {
    assert.equal(strokeAdjustment(50, 25, "dos"), 1.015);
  });

  it("brasse 100m at d=25 : 1 + 0.035 × (1 - 25/100)² = 1 + 0.035 × 0.5625 = 1.0196875", () => {
    const v = strokeAdjustment(100, 25, "brasse");
    assert.ok(Math.abs(v - 1.0196875) < 1e-6);
  });

  it("accepts override map", () => {
    const v = strokeAdjustment(50, 25, "dos", { dos: { "50m": 0.10 } });
    assert.equal(v, 1.025); // 1 + 0.10 × 0.25
  });
});

// ─── Task 8: computeTMax — doc §12.1 50m crawl 23.62 ─────────────────────

describe("computeTMax — doc §12.1 50m crawl 23.62", () => {
  const Tobj = 23.62;
  const D = 50;
  const stroke = "crawl";
  const cases: Array<[number, number]> = [
    [15, 5.69], [20, 8.17], [25, 10.65], [30, 13.25],
    [35, 15.85], [40, 18.42], [45, 21.02], [50, 23.62],
  ];
  for (const [d, expected] of cases) {
    it(`d=${d} → tMAX ≈ ${expected}`, () => {
      const got = computeTMax({ Tobj_s: Tobj, D, d, stroke });
      assert.ok(Math.abs(got - expected) < 0.01, `got ${got.toFixed(3)}, expected ${expected}`);
    });
  }
});

describe("computeTMax — doc §12.2 100m crawl 51.45", () => {
  const Tobj = 51.45;
  const D = 100;
  const stroke = "crawl";
  const cases: Array<[number, number]> = [
    [15, 5.87], [25, 11.01], [35, 16.26], [50, 24.18],
    [75, 37.82], [100, 51.45],
  ];
  for (const [d, expected] of cases) {
    it(`d=${d} → tMAX ≈ ${expected}`, () => {
      const got = computeTMax({ Tobj_s: Tobj, D, d, stroke });
      assert.ok(Math.abs(got - expected) < 0.01, `got ${got.toFixed(3)}`);
    });
  }
});

describe("computeTMax — doc §12.3 200m crawl 1:53.00 (113s)", () => {
  const Tobj = 113.00;
  const D = 200;
  const stroke = "crawl";
  const cases: Array<[number, number]> = [
    [25, 13.00], [50, 26.55], [75, 40.57], [100, 54.80],
    [150, 83.62], [200, 113.00],
  ];
  for (const [d, expected] of cases) {
    it(`d=${d} → tMAX ≈ ${expected}`, () => {
      const got = computeTMax({ Tobj_s: Tobj, D, d, stroke });
      assert.ok(Math.abs(got - expected) < 0.02, `got ${got.toFixed(3)}`);
    });
  }
});

// ─── Task 9: computeZoneTime ──────────────────────────────────────────────

describe("computeZoneTime — doc §12.1", () => {
  it("V0 at d=25 in 50m crawl 23.62 ≈ 15.21", () => {
    const tMax = 10.65;
    const v0 = computeZoneTime({ tMax_s: tMax, zone: "V0", family: "50m" });
    assert.ok(Math.abs(v0 - 15.21) < 0.02, `got ${v0}`);
  });

  it("V3 at d=50 in 100m crawl 51.45 ≈ 25.45", () => {
    const tMax = 24.18;
    const v3 = computeZoneTime({ tMax_s: tMax, zone: "V3", family: "100m" });
    assert.ok(Math.abs(v3 - 25.45) < 0.02, `got ${v3}`);
  });

  it("throws if zone is V4 on a family where V4 is null (no override)", () => {
    assert.throws(
      () => computeZoneTime({ tMax_s: 100, zone: "V4", family: "400m" }),
      /V4 is not enabled/,
    );
  });

  it("accepts coefficient override (e.g., V4 enabled on 400m)", () => {
    const t = computeZoneTime({
      tMax_s: 100, zone: "V4", family: "400m",
      coefficientsOverride: { "400m": { V4: 0.97 } },
    });
    assert.equal(t, 100 / 0.97);
  });
});

// ─── Task 10: compute4NSegment + compute4NCumulative ─────────────────────

describe("compute4NSegment — doc §9", () => {
  it("200 4N, 25m brasse — Tobj=158.00s", () => {
    const got = compute4NSegment({
      Tobj_4N_s: 158.00,
      mode: "200",
      segment_stroke: "brasse",
      d_internal: 25,
    });
    assert.ok(Math.abs(got - 20.87) < 0.05, `got ${got.toFixed(3)}`);
  });

  it("400 4N, 50m papillon, Tobj=300s", () => {
    const got = compute4NSegment({
      Tobj_4N_s: 300.00,
      mode: "400",
      segment_stroke: "papillon",
      d_internal: 50,
    });
    assert.ok(Math.abs(got - 32.29) < 0.05, `got ${got.toFixed(3)}`);
  });
});

describe("compute4NCumulative — doc §9.3", () => {
  it("200 4N at d=125m : papillon(50) + dos(50) + brasse(25)", () => {
    const Tobj = 158.00;
    const got = compute4NCumulative({ Tobj_4N_s: Tobj, mode: "200", d_cumulative: 125 });
    const brasse25 = compute4NSegment({ Tobj_4N_s: Tobj, mode: "200", segment_stroke: "brasse", d_internal: 25 });
    const expected = 158 * 0.218 + 158 * 0.250 + brasse25;
    assert.ok(Math.abs(got - expected) < 0.01, `got ${got.toFixed(3)}`);
  });
});

// ─── Task 11: getDistanceRowsV2 ───────────────────────────────────────────

describe("getDistanceRowsV2", () => {
  it("D=50 single stroke → [15,20,25,30,35,40,45,50]", () => {
    assert.deepEqual(getDistanceRowsV2(50, "crawl"), [15, 20, 25, 30, 35, 40, 45, 50]);
    assert.deepEqual(getDistanceRowsV2(50, "papillon"), [15, 20, 25, 30, 35, 40, 45, 50]);
  });
  it("D=100 → [15,25,35,50,65,75,100]", () => {
    assert.deepEqual(getDistanceRowsV2(100, "dos"), [15, 25, 35, 50, 65, 75, 100]);
  });
  it("D=200 → [25,50,75,100,150,200]", () => {
    assert.deepEqual(getDistanceRowsV2(200, "brasse"), [25, 50, 75, 100, 150, 200]);
  });
  it("D=400 → [50,75,100,150,200,300,400]", () => {
    assert.deepEqual(getDistanceRowsV2(400, "crawl"), [50, 75, 100, 150, 200, 300, 400]);
  });
  it("D=800 → [50,100,200,300,400,600,800]", () => {
    assert.deepEqual(getDistanceRowsV2(800, "crawl"), [50, 100, 200, 300, 400, 600, 800]);
  });
  it("D=1500 → [50,100,200,300,400,800,1000,1500]", () => {
    assert.deepEqual(getDistanceRowsV2(1500, "crawl"), [50, 100, 200, 300, 400, 800, 1000, 1500]);
  });
  it("4N : returns empty (4N uses segmented matrix, not row list)", () => {
    assert.deepEqual(getDistanceRowsV2(200, "4N"), []);
  });
});

// ─── Task 12: validateMatrix ──────────────────────────────────────────────

describe("validateMatrix", () => {
  it("returns [] for a coherent matrix", () => {
    const m = {
      Tobj_s: 23.62, D: 50,
      rows: [
        { d: 25, tMax_s: 10.65, zones: { V0: 15.21, V1: 13.66, V2: 12.39, V3: 11.33, V4: 10.87, MAX: 10.65 } },
        { d: 50, tMax_s: 23.62, zones: { V0: 33.74, V1: 30.28, V2: 27.47, V3: 25.13, V4: 24.10, MAX: 23.62 } },
      ],
    };
    assert.deepEqual(validateMatrix(m), []);
  });
  it("flags non-monotonic tMax", () => {
    const m = {
      Tobj_s: 23.62, D: 50,
      rows: [
        { d: 25, tMax_s: 11.00, zones: {} as Record<string, number> },
        { d: 50, tMax_s: 10.00, zones: {} as Record<string, number> },
      ],
    };
    const errs = validateMatrix(m as Parameters<typeof validateMatrix>[0]);
    assert.ok(errs.some((e) => e.includes("monotonie")));
  });
  it("flags zones not properly ordered", () => {
    const m = {
      Tobj_s: 23.62, D: 50,
      rows: [
        { d: 25, tMax_s: 10.65, zones: { V0: 12.0, V1: 13.0, V2: 11.0, V3: 11.33, V4: 10.87, MAX: 10.65 } as Record<string, number> },
      ],
    };
    const errs = validateMatrix(m as Parameters<typeof validateMatrix>[0]);
    assert.ok(errs.some((e) => e.includes("ordre")));
  });
  it("flags tMax(D) ≠ Tobj", () => {
    const m = {
      Tobj_s: 50.0, D: 50,
      rows: [{ d: 50, tMax_s: 49.5, zones: {} as Record<string, number> }],
    };
    const errs = validateMatrix(m as Parameters<typeof validateMatrix>[0]);
    assert.ok(errs.some((e) => e.includes("Tobj")));
  });
});
