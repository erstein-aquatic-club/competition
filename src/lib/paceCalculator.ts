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

export function formatPaceTimeCs(ms: number): string {
  const rounded = Math.round(ms / 10) * 10;
  const totalSeconds = rounded / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  if (minutes === 0) {
    return seconds.toFixed(2);
  }
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}

export function formatPaceTime(ms: number): string {
  const rounded = Math.round(ms / 100) * 100;
  const totalSeconds = rounded / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  if (minutes === 0) {
    return seconds.toFixed(1);
  }
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

const PACE_RE = /^(?:(\d{1,2}):)?(\d{1,2})(?:\.(\d{1,2}))?$/;

export function parsePaceTime(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const m = trimmed.match(PACE_RE);
  if (!m) return null;
  const minutes = m[1] ? parseInt(m[1], 10) : 0;
  const seconds = parseInt(m[2], 10);
  const decimals = m[3] ? parseInt(m[3].padEnd(2, "0").slice(0, 2), 10) : 0;
  // when minutes component present, seconds must be < 60; bare "65" is total seconds
  if (m[1] !== undefined && seconds >= 60) return null;
  if (minutes < 0 || seconds < 0 || decimals < 0) return null;
  return minutes * 60_000 + seconds * 1_000 + decimals * 10;
}

export function getDistanceRows(targetDistanceM: number, stroke: Stroke): number[] {
  if (stroke === "4N") return ROWS_BY_DIST_4N[targetDistanceM] ?? [];
  if (stroke === "NL") return { ...ROWS_BY_DIST_MULTI, ...ROWS_BY_DIST_NL_ONLY }[targetDistanceM] ?? [];
  return ROWS_BY_DIST_MULTI[targetDistanceM] ?? [];
}
