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
  | { type: "SET_DEPARTURE_INTERVAL"; seconds: number }
  | { type: "ADD_SWIMMER"; swimmer: ChronoSwimmer }
  | { type: "REMOVE_SWIMMER"; athleteId: number }
  | { type: "MOVE_SWIMMER"; athleteId: number; lane: number }
  | { type: "SET_WAVE"; athleteId: number; wave: number }
  | { type: "START_RACE" }
  | { type: "LAUNCH_WAVE"; wave: number; timestamp: number }
  | { type: "RECORD_SPLIT"; athleteId: number; timestamp: number }
  | { type: "UNDO_SPLIT"; athleteId: number }
  | { type: "STOP_SWIMMER"; athleteId: number; timestamp: number }
  | { type: "NEXT_REP"; wave: number }
  | { type: "STOP_RACE"; timestamp: number }
  | { type: "RESET_FOR_NEW_SERIES" }
  | { type: "RESTORE_STATE"; state: ChronoState };

export type { ChronoAction };

// ── Helpers ──────────────────────────────────────────────────────────

export function computeWaves(
  swimmers: ChronoSwimmer[],
  existingWaves: WaveState[] = [],
): WaveState[] {
  const waveNumbers = new Set(swimmers.map((s) => s.wave));
  const sorted = Array.from(waveNumbers).sort((a, b) => a - b);
  const existingMap = new Map(existingWaves.map((w) => [w.wave, w]));

  return sorted.map((wave) => {
    const existing = existingMap.get(wave);
    return existing ?? { wave, startedAt: null, stopped: false, currentRep: 0 };
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
  departureIntervalSec: 0,
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

    case "SET_DEPARTURE_INTERVAL": {
      return { ...state, departureIntervalSec: Math.max(0, action.seconds) };
    }

    case "ADD_SWIMMER": {
      if (state.swimmers.some((s) => s.athleteId === action.swimmer.athleteId)) {
        return state;
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
        raceData.set(swimmer.athleteId, {
          swimmer,
          splitsByRep: [[]],
          stoppedAt: null,
        });
      }
      const waves = state.waves.map((w) => ({ ...w, currentRep: 0 }));
      return {
        ...state,
        phase: "racing",
        raceData,
        waves,
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

      const currentSplits = raceState.splitsByRep[raceState.splitsByRep.length - 1];
      const cumulativeMs = action.timestamp - waveState.startedAt;
      const prevSplit = currentSplits[currentSplits.length - 1];
      const lapMs = prevSplit
        ? cumulativeMs - prevSplit.cumulativeMs
        : cumulativeMs;

      const newSplit: SplitRecord = { cumulativeMs, lapMs };
      const newSplitsByRep = [...raceState.splitsByRep];
      newSplitsByRep[newSplitsByRep.length - 1] = [...currentSplits, newSplit];

      const newRaceData = new Map(state.raceData);
      newRaceData.set(action.athleteId, {
        ...raceState,
        splitsByRep: newSplitsByRep,
      });

      return { ...state, raceData: newRaceData };
    }

    case "UNDO_SPLIT": {
      const raceState = state.raceData.get(action.athleteId);
      if (!raceState) return state;
      const currentSplits = raceState.splitsByRep[raceState.splitsByRep.length - 1];
      if (currentSplits.length === 0) return state;

      const newSplitsByRep = [...raceState.splitsByRep];
      newSplitsByRep[newSplitsByRep.length - 1] = currentSplits.slice(0, -1);

      const newRaceData = new Map(state.raceData);
      newRaceData.set(action.athleteId, {
        ...raceState,
        splitsByRep: newSplitsByRep,
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

      // Check if all swimmers in this wave are now stopped → auto NEXT_REP
      const waveNum = raceState.swimmer.wave;
      const waveSwimmers = Array.from(newRaceData.values()).filter(
        (rs) => rs.swimmer.wave === waveNum,
      );
      const allStopped = waveSwimmers.every((rs) => rs.stoppedAt !== null);

      if (allStopped) {
        // Auto-reset wave for next rep
        const waves = state.waves.map((w) =>
          w.wave === waveNum
            ? { ...w, startedAt: null, currentRep: w.currentRep + 1 }
            : w,
        );
        for (const [id, rs] of newRaceData) {
          if (rs.swimmer.wave === waveNum) {
            newRaceData.set(id, {
              ...rs,
              splitsByRep: [...rs.splitsByRep, []],
              stoppedAt: null,
            });
          }
        }
        return { ...state, waves, raceData: newRaceData };
      }

      return { ...state, raceData: newRaceData };
    }

    case "NEXT_REP": {
      // Reset wave for next rep: clear startedAt, increment currentRep
      const waves = state.waves.map((w) =>
        w.wave === action.wave
          ? { ...w, startedAt: null, currentRep: w.currentRep + 1 }
          : w,
      );
      // Add new empty rep array for each swimmer in this wave, reset stoppedAt
      const newRaceData = new Map(state.raceData);
      for (const [id, rs] of newRaceData) {
        if (rs.swimmer.wave === action.wave) {
          newRaceData.set(id, {
            ...rs,
            splitsByRep: [...rs.splitsByRep, []],
            stoppedAt: null,
          });
        }
      }
      return { ...state, waves, raceData: newRaceData };
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
        currentRep: 0,
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
