import {
  RATIOS_BASE,
  ZONE_COEFFICIENTS,
  STROKE_ADJUSTMENTS_DEFAULT,
  SEGMENTS_4N,
  type EventFamily,
  type Zone,
  type StrokeV2,
} from "./paceData";

export type { EventFamily, StrokeV2, Zone } from "./paceData";

// ─── Task 5: eventFamily + normalizeStroke ────────────────────────────────

const FAMILY_BY_DISTANCE: Record<number, EventFamily> = {
  50: "50m",
  100: "100m",
  200: "200m",
  400: "400m",
  800: "800m_1500m",
  1500: "800m_1500m",
};

export function eventFamily(D: number): EventFamily {
  const f = FAMILY_BY_DISTANCE[D];
  if (!f) throw new Error(`Unsupported event distance: ${D}`);
  return f;
}

const STROKE_ALIASES: Record<string, StrokeV2> = {
  NL: "crawl", crawl: "crawl",
  Pap: "papillon", papillon: "papillon",
  Dos: "dos", dos: "dos",
  Brasse: "brasse", brasse: "brasse",
  "4N": "4N",
};

export function normalizeStroke(s: string): StrokeV2 {
  const v = STROKE_ALIASES[s];
  if (!v) throw new Error(`Unknown stroke: ${s}`);
  return v;
}

// ─── Task 6: getRatio — log-linear interpolation (doc §6) ─────────────────

export function getRatio(D: number, d: number): number {
  const anchors = RATIOS_BASE[D];
  if (!anchors) throw new Error(`Unsupported event distance: ${D}`);
  if (d < anchors[0].d) {
    throw new Error(`d=${d} below smallest anchor (${anchors[0].d}) for D=${D}`);
  }
  if (d > D) {
    throw new Error(`d=${d} above target distance D=${D}`);
  }
  for (const a of anchors) {
    if (a.d === d) return a.ratio;
  }
  for (let i = 1; i < anchors.length; i++) {
    if (d < anchors[i].d) {
      const a1 = anchors[i - 1];
      const a2 = anchors[i];
      const exp = (d - a1.d) / (a2.d - a1.d);
      return a1.ratio * Math.pow(a2.ratio / a1.ratio, exp);
    }
  }
  throw new Error(`Failed to interpolate d=${d} for D=${D}`);
}

// ─── Task 7: strokeAdjustment — A_nage(D,d,S) (doc §7) ───────────────────

type SingleStroke = "crawl" | "dos" | "brasse" | "papillon";

export type StrokeAdjustmentOverrides = Partial<
  Record<SingleStroke, Partial<Record<EventFamily, number>>>
>;

export function strokeAdjustment(
  D: number,
  d: number,
  stroke: SingleStroke,
  overrides?: StrokeAdjustmentOverrides,
): number {
  if (d === D) return 1;
  const family = eventFamily(D);
  const m =
    overrides?.[stroke]?.[family] ??
    STROKE_ADJUSTMENTS_DEFAULT[stroke][family];
  return 1 + m * Math.pow(1 - d / D, 2);
}

// ─── Task 8: computeTMax — tMAX(d) for single strokes ────────────────────

export function computeTMax(args: {
  Tobj_s: number;
  D: number;
  d: number;
  stroke: SingleStroke;
  delta_mesure_s?: number;
  adjustmentOverrides?: StrokeAdjustmentOverrides;
}): number {
  const { Tobj_s, D, d, stroke, delta_mesure_s = 0, adjustmentOverrides } = args;
  const R = getRatio(D, d);
  const A = strokeAdjustment(D, d, stroke, adjustmentOverrides);
  return Tobj_s * R * A + delta_mesure_s;
}

// ─── Task 9: computeZoneTime ───────────────────────────────────────────────

export type ZoneCoefficientsOverride = Partial<
  Record<EventFamily, Partial<Record<Zone, number>>>
>;

export function computeZoneTime(args: {
  tMax_s: number;
  zone: Zone;
  family: EventFamily;
  coefficientsOverride?: ZoneCoefficientsOverride;
}): number {
  const { tMax_s, zone, family, coefficientsOverride } = args;
  const k =
    coefficientsOverride?.[family]?.[zone] ??
    ZONE_COEFFICIENTS[family][zone];
  if (k === null) {
    throw new Error(`V4 is not enabled for family ${family}. Override required.`);
  }
  return tMax_s / k;
}

// ─── Task 10: compute4NSegment + compute4NCumulative ──────────────────────

export function compute4NSegment(args: {
  Tobj_4N_s: number;
  mode: "200" | "400";
  segment_stroke: "papillon" | "dos" | "brasse" | "crawl";
  d_internal: number;
  delta_mesure_s?: number;
  adjustmentOverrides?: StrokeAdjustmentOverrides;
}): number {
  const { Tobj_4N_s, mode, segment_stroke, d_internal, delta_mesure_s = 0, adjustmentOverrides } = args;
  const seg = SEGMENTS_4N[mode].find((s) => s.stroke === segment_stroke);
  if (!seg) throw new Error(`Stroke ${segment_stroke} not in 4N ${mode} segments`);
  if (d_internal <= 0 || d_internal > seg.segment_distance) {
    throw new Error(`d_internal=${d_internal} out of range (0, ${seg.segment_distance}]`);
  }
  const T_segment = Tobj_4N_s * seg.weight;
  const R = getRatio(seg.segment_distance, d_internal);
  const A = strokeAdjustment(seg.segment_distance, d_internal, segment_stroke, adjustmentOverrides);
  return T_segment * R * A + delta_mesure_s;
}

export function compute4NCumulative(args: {
  Tobj_4N_s: number;
  mode: "200" | "400";
  d_cumulative: number;
}): number {
  const { Tobj_4N_s, mode, d_cumulative } = args;
  const segs = SEGMENTS_4N[mode];
  const total_distance = segs.reduce((a, s) => a + s.segment_distance, 0);
  if (d_cumulative <= 0 || d_cumulative > total_distance) {
    throw new Error(`d_cumulative=${d_cumulative} out of (0, ${total_distance}]`);
  }
  let consumed = 0;
  let total_time = 0;
  for (const seg of segs) {
    if (d_cumulative >= consumed + seg.segment_distance) {
      total_time += Tobj_4N_s * seg.weight;
      consumed += seg.segment_distance;
    } else {
      const d_internal = d_cumulative - consumed;
      total_time += compute4NSegment({
        Tobj_4N_s, mode, segment_stroke: seg.stroke, d_internal,
      });
      break;
    }
  }
  return total_time;
}

// ─── Task 11: getDistanceRowsV2 ───────────────────────────────────────────

const ROWS_BY_D: Record<number, number[]> = {
  50:   [15, 20, 25, 30, 35, 40, 45, 50],
  100:  [15, 25, 35, 50, 65, 75, 100],
  200:  [25, 50, 75, 100, 150, 200],
  400:  [50, 75, 100, 150, 200, 300, 400],
  800:  [50, 100, 200, 300, 400, 600, 800],
  1500: [50, 100, 200, 300, 400, 800, 1000, 1500],
};

export function getDistanceRowsV2(D: number, stroke: StrokeV2): number[] {
  if (stroke === "4N") return [];
  return ROWS_BY_D[D] ?? [];
}

// ─── Task 12: validateMatrix ───────────────────────────────────────────────

export interface MatrixForValidation {
  Tobj_s: number;
  D: number;
  rows: Array<{
    d: number;
    tMax_s: number;
    zones: Partial<Record<Zone, number>>;
  }>;
}

export function validateMatrix(m: MatrixForValidation): string[] {
  const errors: string[] = [];
  const sorted = [...m.rows].sort((a, b) => a.d - b.d);

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].tMax_s <= sorted[i - 1].tMax_s) {
      errors.push(`monotonie violée : tMAX(${sorted[i].d}) <= tMAX(${sorted[i - 1].d})`);
    }
  }

  const last = sorted[sorted.length - 1];
  if (last && last.d === m.D) {
    if (Math.abs(last.tMax_s - m.Tobj_s) > 0.05) {
      errors.push(`tMax(${m.D}) = ${last.tMax_s} ne correspond pas à Tobj=${m.Tobj_s}`);
    }
  }

  const zoneOrder: Zone[] = ["V0", "V1", "V2", "V3", "V4", "MAX"];
  for (const row of sorted) {
    const present = zoneOrder.filter((z) => row.zones[z] !== undefined);
    for (let i = 1; i < present.length; i++) {
      const prev = row.zones[present[i - 1]]!;
      const cur = row.zones[present[i]]!;
      if (prev <= cur) {
        errors.push(`ordre des zones violé à d=${row.d} : ${present[i - 1]}=${prev} <= ${present[i]}=${cur}`);
      }
    }
  }

  return errors;
}
