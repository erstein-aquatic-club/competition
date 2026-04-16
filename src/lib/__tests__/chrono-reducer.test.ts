import { describe, it, expect } from "vitest";
import {
  chronoReducer,
  initialChronoState,
  computeWaves,
} from "../chrono-reducer";
import type { ChronoState } from "../chrono-types";
import { formatTime, formatLap } from "../../hooks/useChronoTimer";

// ── Helpers ─────────────────────────────────────────────────

const swimmer = (id: number, wave = 1, lane = 1) => ({
  athleteId: id,
  displayName: `Swimmer ${id}`,
  avatarUrl: null,
  wave,
  lane,
});

function reduce(
  state: ChronoState,
  ...actions: Parameters<typeof chronoReducer>[1][]
): ChronoState {
  return actions.reduce((s, a) => chronoReducer(s, a), state);
}

// ── formatTime / formatLap (centièmes) ──────────────────────

describe("formatTime (centièmes)", () => {
  it("formats 0ms as 0:00.00", () => {
    expect(formatTime(0)).toBe("0:00.00");
  });

  it("formats 65320ms as 1:05.32", () => {
    expect(formatTime(65320)).toBe("1:05.32");
  });

  it("formats 30010ms as 0:30.01", () => {
    expect(formatTime(30010)).toBe("0:30.01");
  });

  it("formats 125ms as 0:00.13 (rounds half-up)", () => {
    // 125ms = 0.125s → toFixed(2) = "0.13" (banker's rounding varies, 0.12 or 0.13)
    const result = formatTime(125);
    expect(result).toMatch(/^0:00\.1[23]$/);
  });

  it("formats sub-second times correctly", () => {
    expect(formatTime(500)).toBe("0:00.50");
  });

  it("returns placeholder for negative ms", () => {
    expect(formatTime(-1)).toBe("--:--.--");
  });
});

describe("formatLap (centièmes)", () => {
  it("formats 32510ms as 32.51", () => {
    expect(formatLap(32510)).toBe("32.51");
  });

  it("delegates to formatTime for >= 60s", () => {
    expect(formatLap(65000)).toBe("1:05.00");
  });

  it("returns placeholder for negative", () => {
    expect(formatLap(-1)).toBe("--.--");
  });

  it("formats exact seconds without trailing zeros", () => {
    expect(formatLap(30000)).toBe("30.00");
  });
});

// ── computeWaves ────────────────────────────────────────────

describe("computeWaves", () => {
  it("creates waves from swimmer wave numbers", () => {
    const swimmers = [swimmer(1, 1), swimmer(2, 2), swimmer(3, 1)];
    const waves = computeWaves(swimmers);
    expect(waves).toHaveLength(2);
    expect(waves[0].wave).toBe(1);
    expect(waves[1].wave).toBe(2);
  });

  it("preserves existing wave state when swimmers change", () => {
    const existing = [
      { wave: 1, startedAt: 1000, stopped: false, currentRep: 2, departureIntervalSec: 10, lastFinishedAt: null },
    ];
    const swimmers = [swimmer(1, 1), swimmer(2, 1)];
    const waves = computeWaves(swimmers, existing);
    expect(waves[0].startedAt).toBe(1000);
    expect(waves[0].currentRep).toBe(2);
  });

  it("returns empty array for no swimmers", () => {
    expect(computeWaves([])).toEqual([]);
  });
});

// ── Setup phase actions ─────────────────────────────────────

describe("setup actions", () => {
  it("SET_LANE_COUNT clamps to [1, 8]", () => {
    expect(chronoReducer(initialChronoState, { type: "SET_LANE_COUNT", count: 0 }).laneCount).toBe(1);
    expect(chronoReducer(initialChronoState, { type: "SET_LANE_COUNT", count: 10 }).laneCount).toBe(8);
    expect(chronoReducer(initialChronoState, { type: "SET_LANE_COUNT", count: 5 }).laneCount).toBe(5);
  });

  it("SET_TOTAL_DISTANCE clamps to >= 0", () => {
    expect(chronoReducer(initialChronoState, { type: "SET_TOTAL_DISTANCE", meters: -50 }).totalDistanceM).toBe(0);
    expect(chronoReducer(initialChronoState, { type: "SET_TOTAL_DISTANCE", meters: 200 }).totalDistanceM).toBe(200);
  });

  it("ADD_SWIMMER deduplicates by athleteId", () => {
    const s1 = swimmer(1);
    const state1 = chronoReducer(initialChronoState, { type: "ADD_SWIMMER", swimmer: s1 });
    const state2 = chronoReducer(state1, { type: "ADD_SWIMMER", swimmer: s1 });
    expect(state2.swimmers).toHaveLength(1);
  });

  it("REMOVE_SWIMMER updates waves", () => {
    const s = reduce(
      initialChronoState,
      { type: "ADD_SWIMMER", swimmer: swimmer(1, 1) },
      { type: "ADD_SWIMMER", swimmer: swimmer(2, 2) },
      { type: "REMOVE_SWIMMER", athleteId: 2 },
    );
    expect(s.swimmers).toHaveLength(1);
    expect(s.waves).toHaveLength(1);
    expect(s.waves[0].wave).toBe(1);
  });

  it("SET_WAVE moves swimmer and rebuilds waves", () => {
    const s = reduce(
      initialChronoState,
      { type: "ADD_SWIMMER", swimmer: swimmer(1, 1) },
      { type: "ADD_SWIMMER", swimmer: swimmer(2, 1) },
      { type: "SET_WAVE", athleteId: 2, wave: 2 },
    );
    expect(s.swimmers.find((sw) => sw.athleteId === 2)?.wave).toBe(2);
    expect(s.waves).toHaveLength(2);
  });
});

// ── Race flow ───────────────────────────────────────────────

describe("race flow", () => {
  const raceReady = reduce(
    initialChronoState,
    { type: "SET_TOTAL_DISTANCE", meters: 100 },
    { type: "SET_SPLIT_DISTANCE", meters: 50 },
    { type: "ADD_SWIMMER", swimmer: swimmer(1, 1, 1) },
    { type: "ADD_SWIMMER", swimmer: swimmer(2, 1, 2) },
  );

  it("START_RACE transitions to racing phase", () => {
    const s = chronoReducer(raceReady, { type: "START_RACE" });
    expect(s.phase).toBe("racing");
    expect(s.raceData.size).toBe(2);
    expect(s.raceData.get(1)?.splitsByRep).toEqual([[]]);
  });

  it("LAUNCH_WAVE sets startedAt timestamp", () => {
    const s = reduce(raceReady, { type: "START_RACE" }, { type: "LAUNCH_WAVE", wave: 1, timestamp: 1000 });
    expect(s.waves[0].startedAt).toBe(1000);
  });

  it("RECORD_SPLIT computes cumulative and lap correctly", () => {
    const s = reduce(
      raceReady,
      { type: "START_RACE" },
      { type: "LAUNCH_WAVE", wave: 1, timestamp: 1000 },
      { type: "RECORD_SPLIT", athleteId: 1, timestamp: 31500 }, // 30.5s cumul
      { type: "RECORD_SPLIT", athleteId: 1, timestamp: 65320 }, // 64.32s cumul
    );
    const splits = s.raceData.get(1)!.splitsByRep[0];
    expect(splits).toHaveLength(2);
    expect(splits[0].cumulativeMs).toBe(30500);
    expect(splits[0].lapMs).toBe(30500);
    expect(splits[1].cumulativeMs).toBe(64320);
    expect(splits[1].lapMs).toBe(33820); // 64320 - 30500
  });

  it("RECORD_SPLIT ignores stopped swimmer", () => {
    const s = reduce(
      raceReady,
      { type: "START_RACE" },
      { type: "LAUNCH_WAVE", wave: 1, timestamp: 1000 },
      { type: "STOP_SWIMMER", athleteId: 1, timestamp: 31000 },
      { type: "RECORD_SPLIT", athleteId: 1, timestamp: 35000 },
    );
    // Only the auto-recorded split from STOP_SWIMMER, no extra from RECORD_SPLIT
    expect(s.raceData.get(1)!.splitsByRep[0]).toHaveLength(1);
  });

  it("UNDO_SPLIT removes the last split", () => {
    const s = reduce(
      raceReady,
      { type: "START_RACE" },
      { type: "LAUNCH_WAVE", wave: 1, timestamp: 1000 },
      { type: "RECORD_SPLIT", athleteId: 1, timestamp: 31000 },
      { type: "RECORD_SPLIT", athleteId: 1, timestamp: 62000 },
      { type: "UNDO_SPLIT", athleteId: 1 },
    );
    expect(s.raceData.get(1)!.splitsByRep[0]).toHaveLength(1);
  });

  it("STOP_SWIMMER auto-records final split and marks stoppedAt", () => {
    const s = reduce(
      raceReady,
      { type: "START_RACE" },
      { type: "LAUNCH_WAVE", wave: 1, timestamp: 1000 },
      { type: "RECORD_SPLIT", athleteId: 1, timestamp: 31000 }, // 50m split at 30s
      { type: "STOP_SWIMMER", athleteId: 1, timestamp: 62500 }, // finish at 61.5s
    );
    const rs = s.raceData.get(1)!;
    expect(rs.stoppedAt).toBe(62500);
    expect(rs.splitsByRep[0]).toHaveLength(2); // manual + auto
    expect(rs.splitsByRep[0][1].cumulativeMs).toBe(61500); // 62500 - 1000
  });

  it("all swimmers stopped → wave gets lastFinishedAt", () => {
    const s = reduce(
      raceReady,
      { type: "START_RACE" },
      { type: "LAUNCH_WAVE", wave: 1, timestamp: 1000 },
      { type: "STOP_SWIMMER", athleteId: 1, timestamp: 62000 },
      { type: "STOP_SWIMMER", athleteId: 2, timestamp: 63000 },
    );
    expect(s.waves[0].lastFinishedAt).toBe(63000);
  });

  it("STOP_RACE transitions to results and auto-stops active swimmers", () => {
    const s = reduce(
      raceReady,
      { type: "START_RACE" },
      { type: "LAUNCH_WAVE", wave: 1, timestamp: 1000 },
      { type: "RECORD_SPLIT", athleteId: 1, timestamp: 31000 },
      { type: "STOP_RACE", timestamp: 65000 },
    );
    expect(s.phase).toBe("results");
    expect(s.stoppedAt).toBe(65000);
    // Both swimmers should have stoppedAt set
    expect(s.raceData.get(1)!.stoppedAt).toBe(65000);
    expect(s.raceData.get(2)!.stoppedAt).toBe(65000);
  });

  it("RESET_FOR_NEW_SERIES goes back to setup with swimmers preserved", () => {
    const s = reduce(
      raceReady,
      { type: "START_RACE" },
      { type: "LAUNCH_WAVE", wave: 1, timestamp: 1000 },
      { type: "STOP_RACE", timestamp: 65000 },
      { type: "RESET_FOR_NEW_SERIES" },
    );
    expect(s.phase).toBe("setup");
    expect(s.raceData.size).toBe(0);
    expect(s.swimmers).toHaveLength(2); // preserved
    expect(s.waves[0].startedAt).toBeNull();
  });
});
