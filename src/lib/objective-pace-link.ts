import type { Stroke } from "./paceCalculator";
import type { PoolSize } from "./poolConversion";

const STROKE_MAP: Record<string, Stroke> = {
  NL: "NL",
  DOS: "Dos",
  BR: "Brasse",
  PAP: "Pap",
  QN: "4N",
};

export interface ParsedObjectiveTarget {
  stroke: Stroke;
  distance: number;
  pool_size: PoolSize;
}

/**
 * Parse an `objectives.event_code` (compact format, ex. "100NL", "200DOS",
 * "400QN") + `pool_length` into a pace-target shape ready to upsert.
 *
 * Returns null if the event_code does not match the FFN compact format
 * `^(\d+)(NL|DOS|BR|PAP|QN)$`.
 *
 * pool_length=25 → "25m", any other (50, null, undefined) → "50m".
 */
export function parseObjectiveForPace(
  event_code: string | null | undefined,
  pool_length: number | null | undefined,
): ParsedObjectiveTarget | null {
  if (!event_code) return null;
  const match = event_code.match(/^(\d+)(NL|DOS|BR|PAP|QN)$/);
  if (!match) return null;
  const distance = parseInt(match[1], 10);
  if (!Number.isFinite(distance) || distance <= 0) return null;
  const stroke = STROKE_MAP[match[2]];
  if (!stroke) return null;
  const pool_size: PoolSize = pool_length === 25 ? "25m" : "50m";
  return { stroke, distance, pool_size };
}
