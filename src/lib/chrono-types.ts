export type ChronoSwimmerKind = "registered" | "manual";

export interface ChronoSwimmer {
  /** Clé stable unique — "a:<athleteId>" ou "m:<uuid>" */
  key: string;
  kind: ChronoSwimmerKind;
  /** ID public.users (null pour manual) */
  athleteId: number | null;
  /** UUID local chrono (null pour registered) */
  manualId: string | null;
  displayName: string;
  avatarUrl: string | null;
  wave: number; // 1-based
  lane: number; // 1-based
}

export interface SplitRecord {
  /** Cumulative time in ms since wave GO */
  cumulativeMs: number;
  /** Lap time in ms (diff from previous split) */
  lapMs: number;
}

export interface SwimmerRaceState {
  swimmer: ChronoSwimmer;
  /** Splits grouped by rep: splitsByRep[0] = first rep, etc. */
  splitsByRep: SplitRecord[][];
  /** Timestamp (Date.now()) when swimmer was individually stopped, null if still racing */
  stoppedAt: number | null;
}

/** Per-wave override of the global config. Missing key = inherit from global. */
export interface WaveConfigOverrides {
  seriesCount?: number;
  totalDistanceM?: number;
  splitDistanceM?: number;
}

export interface WaveState {
  wave: number;
  startedAt: number | null; // Date.now() timestamp
  stopped: boolean;
  /** Current rep index (0-based) */
  currentRep: number;
  /** Departure interval in seconds for this wave (0 = no countdown) */
  departureIntervalSec: number;
  /** Timestamp when all swimmers in the wave finished (for recovery timer) */
  lastFinishedAt: number | null;
  /** Per-wave config overrides (null = inherit from global) */
  overrides: WaveConfigOverrides | null;
}

export type ChronoPhase = "setup" | "racing" | "results";

export interface ChronoState {
  phase: ChronoPhase;
  laneCount: number;
  swimmers: ChronoSwimmer[];
  waves: WaveState[];
  raceData: Map<string, SwimmerRaceState>; // keyed by swimmer key
  stoppedAt: number | null;
  /** Total distance per series in meters (0 = not set) */
  totalDistanceM: number;
  /** Split distance in meters (0 = not set, splits numbered only) */
  splitDistanceM: number;
  /** Number of series (0 = unlimited) */
  seriesCount: number;
  title: string;
}

export const DISTANCE_PRESETS = [25, 50, 100, 200, 400, 800, 1500] as const;
export const SPLIT_PRESETS = [25, 50, 100] as const;

export const WAVE_COLORS = [
  { bg: "bg-cyan-500/20", border: "border-cyan-500", text: "text-cyan-400", dot: "bg-cyan-400", label: "V1" },
  { bg: "bg-orange-500/20", border: "border-orange-500", text: "text-orange-400", dot: "bg-orange-400", label: "V2" },
  { bg: "bg-green-500/20", border: "border-green-500", text: "text-green-400", dot: "bg-green-400", label: "V3" },
  { bg: "bg-pink-500/20", border: "border-pink-500", text: "text-pink-400", dot: "bg-pink-400", label: "V4" },
  { bg: "bg-yellow-500/20", border: "border-yellow-500", text: "text-yellow-400", dot: "bg-yellow-400", label: "V5" },
  { bg: "bg-purple-500/20", border: "border-purple-500", text: "text-purple-400", dot: "bg-purple-400", label: "V6" },
] as const;

export function swimmerKey(s: Pick<ChronoSwimmer, "kind" | "athleteId" | "manualId">): string {
  if (s.kind === "manual") {
    if (!s.manualId) throw new Error("Manual swimmer missing manualId");
    return `m:${s.manualId}`;
  }
  if (s.athleteId == null) throw new Error("Registered swimmer missing athleteId");
  return `a:${s.athleteId}`;
}

export function buildRegisteredSwimmer(args: {
  athleteId: number;
  displayName: string;
  avatarUrl?: string | null;
  wave?: number;
  lane: number;
}): ChronoSwimmer {
  return {
    key: `a:${args.athleteId}`,
    kind: "registered",
    athleteId: args.athleteId,
    manualId: null,
    displayName: args.displayName,
    avatarUrl: args.avatarUrl ?? null,
    wave: args.wave ?? 1,
    lane: args.lane,
  };
}

export function buildManualSwimmer(args: {
  manualId: string;
  displayName: string;
  wave?: number;
  lane: number;
}): ChronoSwimmer {
  return {
    key: `m:${args.manualId}`,
    kind: "manual",
    athleteId: null,
    manualId: args.manualId,
    displayName: args.displayName,
    avatarUrl: null,
    wave: args.wave ?? 1,
    lane: args.lane,
  };
}

import type { ChronoRecordSwimmer } from "./api/types";

export interface NormalizedChronoRecordSwimmer extends ChronoRecordSwimmer {
  kind: "registered" | "manual";
  manualId: string | null;
}

export function normalizeRecordSwimmer(sw: ChronoRecordSwimmer): NormalizedChronoRecordSwimmer {
  const kind = sw.kind ?? (sw.athleteId != null ? "registered" : "manual");
  return {
    ...sw,
    kind,
    manualId: sw.manualId ?? null,
  };
}

export function resolveWaveConfig(
  state: Pick<ChronoState, "seriesCount" | "totalDistanceM" | "splitDistanceM" | "waves">,
  wave: number,
): { seriesCount: number; totalDistanceM: number; splitDistanceM: number } {
  const w = state.waves.find((w) => w.wave === wave);
  return {
    seriesCount:    w?.overrides?.seriesCount    ?? state.seriesCount,
    totalDistanceM: w?.overrides?.totalDistanceM ?? state.totalDistanceM,
    splitDistanceM: w?.overrides?.splitDistanceM ?? state.splitDistanceM,
  };
}
