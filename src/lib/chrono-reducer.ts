import type {
  ChronoState,
  ChronoSwimmer,
  SplitRecord,
  SwimmerRaceState,
  WaveState,
} from "./chrono-types";

// ── Actions ──────────────────────────────────────────────────────────

type ChronoAction =
  | { type: "SET_LANE_COUNT"; count: number }
  | { type: "ADD_SWIMMER"; swimmer: ChronoSwimmer }
  | { type: "REMOVE_SWIMMER"; athleteId: number }
  | { type: "MOVE_SWIMMER"; athleteId: number; lane: number }
  | { type: "SET_WAVE"; athleteId: number; wave: number }
  | { type: "START_RACE" }
  | { type: "LAUNCH_WAVE"; wave: number; timestamp: number }
  | { type: "RECORD_SPLIT"; athleteId: number; timestamp: number }
  | { type: "UNDO_SPLIT"; athleteId: number }
  | { type: "STOP_SWIMMER"; athleteId: number; timestamp: number }
  | { type: "STOP_RACE"; timestamp: number }
  | { type: "RESET_FOR_NEW_SERIES" }
  | { type: "RESTORE_STATE"; state: ChronoState };

export type { ChronoAction };

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Derive WaveState[] from swimmers' wave assignments,
 * preserving existing wave state (startedAt, stopped) when available.
 */
export function computeWaves(
  swimmers: ChronoSwimmer[],
  existingWaves: WaveState[] = [],
): WaveState[] {
  const waveNumbers = new Set(swimmers.map((s) => s.wave));
  const sorted = Array.from(waveNumbers).sort((a, b) => a - b);
  const existingMap = new Map(existingWaves.map((w) => [w.wave, w]));

  return sorted.map((wave) => {
    const existing = existingMap.get(wave);
    return existing ?? { wave, startedAt: null, stopped: false };
  });
}

// ── Initial state ────────────────────────────────────────────────────

export const initialChronoState: ChronoState = {
  phase: "setup",
  laneCount: 3,
  swimmers: [],
  waves: [],
  raceData: new Map(),
  stoppedAt: null,
};

// ── Reducer ──────────────────────────────────────────────────────────

export function chronoReducer(
  state: ChronoState,
  action: ChronoAction,
): ChronoState {
  switch (action.type) {
    case "SET_LANE_COUNT": {
      const laneCount = Math.max(1, Math.min(8, action.count));
      return { ...state, laneCount };
    }

    case "ADD_SWIMMER": {
      if (state.swimmers.some((s) => s.athleteId === action.swimmer.athleteId)) {
        return state; // no-op if already exists
      }
      const swimmers = [...state.swimmers, action.swimmer];
      return { ...state, swimmers, waves: computeWaves(swimmers, state.waves) };
    }

    case "REMOVE_SWIMMER": {
      const swimmers = state.swimmers.filter(
        (s) => s.athleteId !== action.athleteId,
      );
      return { ...state, swimmers, waves: computeWaves(swimmers, state.waves) };
    }

    case "MOVE_SWIMMER": {
      const swimmers = state.swimmers.map((s) =>
        s.athleteId === action.athleteId ? { ...s, lane: action.lane } : s,
      );
      return { ...state, swimmers };
    }

    case "SET_WAVE": {
      const swimmers = state.swimmers.map((s) =>
        s.athleteId === action.athleteId ? { ...s, wave: action.wave } : s,
      );
      return { ...state, swimmers, waves: computeWaves(swimmers, state.waves) };
    }

    case "START_RACE": {
      const raceData = new Map<number, SwimmerRaceState>();
      for (const swimmer of state.swimmers) {
        raceData.set(swimmer.athleteId, { swimmer, splits: [], stoppedAt: null });
      }
      return {
        ...state,
        phase: "racing",
        raceData,
        stoppedAt: null,
      };
    }

    case "LAUNCH_WAVE": {
      const waves = state.waves.map((w) =>
        w.wave === action.wave
          ? { ...w, startedAt: action.timestamp }
          : w,
      );
      return { ...state, waves };
    }

    case "RECORD_SPLIT": {
      const raceState = state.raceData.get(action.athleteId);
      if (!raceState || raceState.stoppedAt) return state;

      const swimmer = raceState.swimmer;
      const waveState = state.waves.find((w) => w.wave === swimmer.wave);
      if (!waveState?.startedAt) return state;

      const cumulativeMs = action.timestamp - waveState.startedAt;
      const prevSplit = raceState.splits[raceState.splits.length - 1];
      const lapMs = prevSplit
        ? cumulativeMs - prevSplit.cumulativeMs
        : cumulativeMs;

      const newSplit: SplitRecord = { cumulativeMs, lapMs };
      const newRaceData = new Map(state.raceData);
      newRaceData.set(action.athleteId, {
        ...raceState,
        splits: [...raceState.splits, newSplit],
      });

      return { ...state, raceData: newRaceData };
    }

    case "UNDO_SPLIT": {
      const raceState = state.raceData.get(action.athleteId);
      if (!raceState || raceState.splits.length === 0) return state;

      const newRaceData = new Map(state.raceData);
      newRaceData.set(action.athleteId, {
        ...raceState,
        splits: raceState.splits.slice(0, -1),
      });

      return { ...state, raceData: newRaceData };
    }

    case "STOP_SWIMMER": {
      const raceState = state.raceData.get(action.athleteId);
      if (!raceState || raceState.stoppedAt) return state;
      const newRaceData = new Map(state.raceData);
      newRaceData.set(action.athleteId, {
        ...raceState,
        stoppedAt: action.timestamp,
      });
      return { ...state, raceData: newRaceData };
    }

    case "STOP_RACE": {
      const waves = state.waves.map((w) => ({ ...w, stopped: true }));
      return {
        ...state,
        phase: "results",
        waves,
        stoppedAt: action.timestamp,
      };
    }

    case "RESET_FOR_NEW_SERIES": {
      const waves = state.waves.map((w) => ({
        ...w,
        startedAt: null,
        stopped: false,
      }));
      return {
        ...state,
        phase: "setup",
        raceData: new Map(),
        waves,
        stoppedAt: null,
      };
    }

    case "RESTORE_STATE": {
      return action.state;
    }

    default:
      return state;
  }
}
