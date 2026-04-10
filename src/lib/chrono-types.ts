export interface ChronoSwimmer {
  athleteId: number;
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

export interface WaveState {
  wave: number;
  startedAt: number | null; // Date.now() timestamp
  stopped: boolean;
  /** Current rep index (0-based) */
  currentRep: number;
}

export type ChronoPhase = "setup" | "racing" | "results";

export interface ChronoState {
  phase: ChronoPhase;
  laneCount: number;
  swimmers: ChronoSwimmer[];
  waves: WaveState[];
  raceData: Map<number, SwimmerRaceState>; // keyed by athleteId
  stoppedAt: number | null;
  /** Departure interval in seconds (0 = no countdown) */
  departureIntervalSec: number;
}

export const WAVE_COLORS = [
  { bg: "bg-cyan-500/20", border: "border-cyan-500", text: "text-cyan-400", dot: "bg-cyan-400", label: "V1" },
  { bg: "bg-orange-500/20", border: "border-orange-500", text: "text-orange-400", dot: "bg-orange-400", label: "V2" },
  { bg: "bg-green-500/20", border: "border-green-500", text: "text-green-400", dot: "bg-green-400", label: "V3" },
  { bg: "bg-pink-500/20", border: "border-pink-500", text: "text-pink-400", dot: "bg-pink-400", label: "V4" },
  { bg: "bg-yellow-500/20", border: "border-yellow-500", text: "text-yellow-400", dot: "bg-yellow-400", label: "V5" },
  { bg: "bg-purple-500/20", border: "border-purple-500", text: "text-purple-400", dot: "bg-purple-400", label: "V6" },
] as const;
