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
