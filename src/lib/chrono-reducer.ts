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
  | { type: "SET_TOTAL_DISTANCE"; meters: number }
  | { type: "SET_SPLIT_DISTANCE"; meters: number }
  | { type: "SET_SERIES_COUNT"; count: number }
  | { type: "SET_TITLE"; title: string }
  | { type: "SET_WAVE_INTERVAL"; wave: number; seconds: number }
  | { type: "ADD_SWIMMER"; swimmer: ChronoSwimmer }
  | { type: "REMOVE_SWIMMER"; key: string }
  | { type: "MOVE_SWIMMER"; key: string; lane: number }
  | { type: "SET_WAVE"; key: string; wave: number }
  | { type: "START_RACE" }
  | { type: "LAUNCH_WAVE"; wave: number; timestamp: number }
  | { type: "RECORD_SPLIT"; key: string; timestamp: number }
  | { type: "UNDO_SPLIT"; key: string }
  | { type: "STOP_SWIMMER"; key: string; timestamp: number }
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
    return existing ?? { wave, startedAt: null, stopped: false, currentRep: 0, departureIntervalSec: 0, lastFinishedAt: null };
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
  totalDistanceM: 0,
  splitDistanceM: 50,
  seriesCount: 0,
  title: "",
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

    case "SET_TOTAL_DISTANCE": {
      return { ...state, totalDistanceM: Math.max(0, action.meters) };
    }

    case "SET_SPLIT_DISTANCE": {
      return { ...state, splitDistanceM: Math.max(0, action.meters) };
    }

    case "SET_SERIES_COUNT": {
      return { ...state, seriesCount: Math.max(0, action.count) };
    }

    case "SET_TITLE": {
      return { ...state, title: action.title };
    }

    case "SET_WAVE_INTERVAL": {
      const waves = state.waves.map((w) =>
        w.wave === action.wave
          ? { ...w, departureIntervalSec: Math.max(0, action.seconds) }
          : w,
      );
      return { ...state, waves };
    }

    case "ADD_SWIMMER": {
      if (state.swimmers.some((s) => s.key === action.swimmer.key)) {
        return state;
      }
      const swimmers = [...state.swimmers, action.swimmer];
      return { ...state, swimmers, waves: computeWaves(swimmers, state.waves) };
    }

    case "REMOVE_SWIMMER": {
      const swimmers = state.swimmers.filter(
        (s) => s.key !== action.key,
      );
      return { ...state, swimmers, waves: computeWaves(swimmers, state.waves) };
    }

    case "MOVE_SWIMMER": {
      const swimmers = state.swimmers.map((s) =>
        s.key === action.key ? { ...s, lane: action.lane } : s,
      );
      return { ...state, swimmers };
    }

    case "SET_WAVE": {
      const swimmers = state.swimmers.map((s) =>
        s.key === action.key ? { ...s, wave: action.wave } : s,
      );
      return { ...state, swimmers, waves: computeWaves(swimmers, state.waves) };
    }

    case "START_RACE": {
      const raceData = new Map<string, SwimmerRaceState>();
      for (const swimmer of state.swimmers) {
        raceData.set(swimmer.key, {
          swimmer,
          splitsByRep: [[]],
          stoppedAt: null,
        });
      }
      const waves = state.waves.map((w) => ({ ...w, currentRep: 0, lastFinishedAt: null }));
      return {
        ...state,
        phase: "racing",
        raceData,
        waves,
        stoppedAt: null,
      };
    }

    case "LAUNCH_WAVE": {
      const prevWave = state.waves.find((w) => w.wave === action.wave);
      const wasFinished = prevWave?.lastFinishedAt !== null;
      const waves = state.waves.map((w) =>
        w.wave === action.wave
          ? { ...w, startedAt: action.timestamp, lastFinishedAt: null, currentRep: wasFinished ? w.currentRep + 1 : w.currentRep }
          : w,
      );
      // Reset swimmers for next rep when relaunching after all finished
      let raceData = state.raceData;
      if (wasFinished) {
        raceData = new Map(state.raceData);
        for (const [key, rs] of raceData) {
          if (rs.swimmer.wave === action.wave) {
            raceData.set(key, {
              ...rs,
              splitsByRep: [...rs.splitsByRep, []],
              stoppedAt: null,
            });
          }
        }
      }
      return { ...state, waves, raceData };
    }

    case "RECORD_SPLIT": {
      const raceState = state.raceData.get(action.key);
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
      newRaceData.set(action.key, {
        ...raceState,
        splitsByRep: newSplitsByRep,
      });

      return { ...state, raceData: newRaceData };
    }

    case "UNDO_SPLIT": {
      const raceState = state.raceData.get(action.key);
      if (!raceState) return state;
      const currentSplits = raceState.splitsByRep[raceState.splitsByRep.length - 1];
      if (currentSplits.length === 0) return state;

      const newSplitsByRep = [...raceState.splitsByRep];
      newSplitsByRep[newSplitsByRep.length - 1] = currentSplits.slice(0, -1);

      const newRaceData = new Map(state.raceData);
      newRaceData.set(action.key, {
        ...raceState,
        splitsByRep: newSplitsByRep,
      });

      return { ...state, raceData: newRaceData };
    }

    case "STOP_SWIMMER": {
      const raceState = state.raceData.get(action.key);
      if (!raceState || raceState.stoppedAt) return state;

      // Auto-record a final split at stop time
      const swimmerWave = state.waves.find((w) => w.wave === raceState.swimmer.wave);
      let updatedRaceState = { ...raceState, stoppedAt: action.timestamp };
      if (swimmerWave?.startedAt) {
        const cumulativeMs = action.timestamp - swimmerWave.startedAt;
        const currentSplits = raceState.splitsByRep[raceState.splitsByRep.length - 1];
        const prevSplit = currentSplits[currentSplits.length - 1];
        const lapMs = prevSplit ? cumulativeMs - prevSplit.cumulativeMs : cumulativeMs;
        const newSplitsByRep = [...raceState.splitsByRep];
        newSplitsByRep[newSplitsByRep.length - 1] = [...currentSplits, { cumulativeMs, lapMs }];
        updatedRaceState = { ...updatedRaceState, splitsByRep: newSplitsByRep };
      }

      const newRaceData = new Map(state.raceData);
      newRaceData.set(action.key, updatedRaceState);

      // Check if all swimmers in this wave are now stopped → auto NEXT_REP
      const waveNum = raceState.swimmer.wave;
      const waveSwimmers = Array.from(newRaceData.values()).filter(
        (rs) => rs.swimmer.wave === waveNum,
      );
      const allStopped = waveSwimmers.every((rs) => rs.stoppedAt !== null);

      if (allStopped) {
        // Mark wave as "between reps" — swimmers stay frozen until next LAUNCH_WAVE
        const waves = state.waves.map((w) =>
          w.wave === waveNum
            ? { ...w, lastFinishedAt: action.timestamp }
            : w,
        );
        return { ...state, waves, raceData: newRaceData };
      }

      return { ...state, raceData: newRaceData };
    }

    case "NEXT_REP": {
      // Mark wave as "between reps" — swimmers stay frozen until next LAUNCH_WAVE
      const waves = state.waves.map((w) =>
        w.wave === action.wave
          ? { ...w, lastFinishedAt: Date.now() }
          : w,
      );
      return { ...state, waves };
    }

    case "STOP_RACE": {
      const waves = state.waves.map((w) => ({ ...w, stopped: true }));
      // Auto-record final split for all active swimmers
      const newRaceData = new Map(state.raceData);
      for (const [key, rs] of newRaceData) {
        if (rs.stoppedAt) continue; // already stopped
        const swimmerWave = state.waves.find((w) => w.wave === rs.swimmer.wave);
        if (!swimmerWave?.startedAt) continue;
        const cumulativeMs = action.timestamp - swimmerWave.startedAt;
        const currentSplits = rs.splitsByRep[rs.splitsByRep.length - 1];
        const prevSplit = currentSplits[currentSplits.length - 1];
        const lapMs = prevSplit ? cumulativeMs - prevSplit.cumulativeMs : cumulativeMs;
        const newSplitsByRep = [...rs.splitsByRep];
        newSplitsByRep[newSplitsByRep.length - 1] = [...currentSplits, { cumulativeMs, lapMs }];
        newRaceData.set(key, { ...rs, splitsByRep: newSplitsByRep, stoppedAt: action.timestamp });
      }
      return {
        ...state,
        phase: "results",
        waves,
        raceData: newRaceData,
        stoppedAt: action.timestamp,
      };
    }

    case "RESET_FOR_NEW_SERIES": {
      const waves = state.waves.map((w) => ({
        ...w,
        startedAt: null,
        stopped: false,
        currentRep: 0,
        lastFinishedAt: null,
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
