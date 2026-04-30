export type Stroke = "NL" | "Dos" | "Brasse" | "Pap" | "4N";
export type Zone = "V0" | "V1" | "V2" | "V3" | "Max";

export interface ZoneConfig {
  v0_pct: number;
  v1_pct: number;
  v2_pct: number;
  v3_pct: number;
  max_pct: number;
}

export const DEFAULT_ZONES: ZoneConfig = {
  v0_pct: 140,
  v1_pct: 130,
  v2_pct: 115,
  v3_pct: 110,
  max_pct: 105,
};

export function pacePer100m(targetTimeMs: number, targetDistanceM: number): number {
  if (targetDistanceM <= 0) {
    throw new Error("targetDistanceM must be > 0");
  }
  return Math.round((targetTimeMs * 100) / targetDistanceM);
}

export function zoneTime(distanceM: number, pacePer100mMs: number, zonePct: number): number {
  return Math.round((pacePer100mMs * distanceM * zonePct) / (100 * 100));
}

const ROWS_BY_DIST_MULTI: Record<number, number[]> = {
  50:  [15, 20, 25, 50],
  100: [15, 25, 50, 75, 100],
  200: [25, 50, 100, 150, 200],
};

const ROWS_BY_DIST_NL_ONLY: Record<number, number[]> = {
  400:  [50, 100, 200, 300, 400],
  800:  [100, 200, 400, 600, 800],
  1500: [100, 200, 400, 800, 1200, 1500],
};

const ROWS_BY_DIST_4N: Record<number, number[]> = {
  100: [25, 50, 75, 100],
  200: [50, 100, 150, 200],
  400: [100, 200, 300, 400],
};

export function getDistanceRows(targetDistanceM: number, stroke: Stroke): number[] {
  if (stroke === "4N") return ROWS_BY_DIST_4N[targetDistanceM] ?? [];
  if (stroke === "NL") return { ...ROWS_BY_DIST_MULTI, ...ROWS_BY_DIST_NL_ONLY }[targetDistanceM] ?? [];
  return ROWS_BY_DIST_MULTI[targetDistanceM] ?? [];
}
