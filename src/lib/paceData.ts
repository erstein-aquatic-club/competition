export type RatioAnchor = { d: number; ratio: number };

// ─── RATIOS_BASE — R_base(D, d) anchor points (doc §5) ────────────────────

export const RATIOS_BASE: Record<number, RatioAnchor[]> = {
  50: [
    { d: 15, ratio: 0.241 }, { d: 20, ratio: 0.346 }, { d: 25, ratio: 0.451 },
    { d: 30, ratio: 0.561 }, { d: 35, ratio: 0.671 }, { d: 40, ratio: 0.780 },
    { d: 45, ratio: 0.890 }, { d: 50, ratio: 1.000 },
  ],
  100: [
    { d: 15, ratio: 0.114 }, { d: 25, ratio: 0.214 }, { d: 35, ratio: 0.316 },
    { d: 50, ratio: 0.470 }, { d: 75, ratio: 0.735 }, { d: 100, ratio: 1.000 },
  ],
  200: [
    { d: 25, ratio: 0.115 }, { d: 50, ratio: 0.235 }, { d: 75, ratio: 0.359 },
    { d: 100, ratio: 0.485 }, { d: 150, ratio: 0.740 }, { d: 200, ratio: 1.000 },
  ],
  400: [
    { d: 50, ratio: 0.120 }, { d: 100, ratio: 0.245 }, { d: 150, ratio: 0.370 },
    { d: 200, ratio: 0.496 }, { d: 300, ratio: 0.747 }, { d: 400, ratio: 1.000 },
  ],
  800: [
    { d: 50, ratio: 0.061 }, { d: 100, ratio: 0.124 }, { d: 200, ratio: 0.249 },
    { d: 400, ratio: 0.500 }, { d: 600, ratio: 0.751 }, { d: 800, ratio: 1.000 },
  ],
  1500: [
    { d: 50, ratio: 0.032 }, { d: 100, ratio: 0.066 }, { d: 200, ratio: 0.133 },
    { d: 400, ratio: 0.266 }, { d: 800, ratio: 0.534 }, { d: 1000, ratio: 0.668 },
    { d: 1500, ratio: 1.000 },
  ],
};

export function getRatioAnchors(D: number): RatioAnchor[] {
  const anchors = RATIOS_BASE[D];
  if (!anchors) throw new Error(`Unknown event distance: ${D}`);
  return anchors;
}

// ─── ZONE_COEFFICIENTS — k_allure by event family (doc §4) ────────────────

export type EventFamily = "50m" | "100m" | "200m" | "400m" | "800m_1500m";
export type Zone = "V0" | "V1" | "V2" | "V3" | "V4" | "MAX";

export interface FamilyCoefficients {
  V0: number;
  V1: number;
  V2: number;
  V3: number;
  V4: number | null;
  MAX: number;
}

export const ZONE_COEFFICIENTS: Record<EventFamily, FamilyCoefficients> = {
  "50m":        { V0: 0.70, V1: 0.78, V2: 0.86, V3: 0.94, V4: 0.98,  MAX: 1.00 },
  "100m":       { V0: 0.72, V1: 0.80, V2: 0.88, V3: 0.95, V4: 0.98,  MAX: 1.00 },
  "200m":       { V0: 0.74, V1: 0.82, V2: 0.90, V3: 0.96, V4: 0.985, MAX: 1.00 },
  "400m":       { V0: 0.76, V1: 0.84, V2: 0.91, V3: 0.96, V4: null,  MAX: 1.00 },
  "800m_1500m": { V0: 0.78, V1: 0.86, V2: 0.92, V3: 0.97, V4: null,  MAX: 1.00 },
};

// ─── STROKE_ADJUSTMENTS_DEFAULT — mS medians (doc §7) ─────────────────────

export type StrokeV2 = "crawl" | "dos" | "brasse" | "papillon" | "4N";

type SingleStroke = "crawl" | "dos" | "brasse" | "papillon";

export const STROKE_ADJUSTMENTS_DEFAULT: Record<SingleStroke, Record<EventFamily, number>> = {
  crawl:    { "50m": 0.00,  "100m": 0.000, "200m": 0.000, "400m": 0.00, "800m_1500m": 0.00 },
  papillon: { "50m": 0.00,  "100m": 0.000, "200m": 0.010, "400m": 0.01, "800m_1500m": 0.01 },
  dos:      { "50m": 0.06,  "100m": 0.045, "200m": 0.020, "400m": 0.01, "800m_1500m": 0.01 },
  brasse:   { "50m": 0.04,  "100m": 0.035, "200m": 0.025, "400m": 0.01, "800m_1500m": 0.01 },
};

// ─── SEGMENTS_4N — segment weights (doc §9) ───────────────────────────────

export interface FourNSegment {
  stroke: "papillon" | "dos" | "brasse" | "crawl";
  segment_distance: number;
  weight: number;
}

export const SEGMENTS_4N: Record<"200" | "400", FourNSegment[]> = {
  "200": [
    { stroke: "papillon", segment_distance: 50, weight: 0.218 },
    { stroke: "dos",      segment_distance: 50, weight: 0.250 },
    { stroke: "brasse",   segment_distance: 50, weight: 0.290 },
    { stroke: "crawl",    segment_distance: 50, weight: 0.242 },
  ],
  "400": [
    { stroke: "papillon", segment_distance: 100, weight: 0.229 },
    { stroke: "dos",      segment_distance: 100, weight: 0.255 },
    { stroke: "brasse",   segment_distance: 100, weight: 0.280 },
    { stroke: "crawl",    segment_distance: 100, weight: 0.236 },
  ],
};
