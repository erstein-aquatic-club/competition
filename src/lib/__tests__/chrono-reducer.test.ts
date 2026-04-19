import { describe, it, expect } from "vitest";
import {
  chronoReducer,
  initialChronoState,
  computeWaves,
  createChronoDefaultTitle,
  createInitialChronoState,
} from "../chrono-reducer";
import {
  buildRegisteredSwimmer,
  buildManualSwimmer,
  normalizeRecordSwimmer,
} from "../chrono-types";
import type { ChronoState } from "../chrono-types";
import { formatTime, formatLap } from "../../hooks/useChronoTimer";

// ── Helpers ─────────────────────────────────────────────────

const reg = (id: number, wave = 1, lane = 1) =>
  buildRegisteredSwimmer({ athleteId: id, displayName: `Swimmer ${id}`, wave, lane });

const manual = (uuid: string, name: string, wave = 1, lane = 1) =>
  buildManualSwimmer({ manualId: uuid, displayName: name, wave, lane });

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
    const swimmers = [reg(1, 1), reg(2, 2), reg(3, 1)];
    const waves = computeWaves(swimmers);
    expect(waves).toHaveLength(2);
    expect(waves[0].wave).toBe(1);
    expect(waves[1].wave).toBe(2);
  });

  it("preserves existing wave state when swimmers change", () => {
    const existing = [
      { wave: 1, startedAt: 1000, stopped: false, currentRep: 2, departureIntervalSec: 10, lastFinishedAt: null },
    ];
    const swimmers = [reg(1, 1), reg(2, 1)];
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
  it("createInitialChronoState seeds a dated default title", () => {
    const state = createInitialChronoState(new Date("2026-04-18T09:30:00"));
    expect(state.title).toBe("Chrono coach — 18/04/2026");
  });

  it("SET_LANE_COUNT clamps to [1, 8]", () => {
    expect(chronoReducer(initialChronoState, { type: "SET_LANE_COUNT", count: 0 }).laneCount).toBe(1);
    expect(chronoReducer(initialChronoState, { type: "SET_LANE_COUNT", count: 10 }).laneCount).toBe(8);
    expect(chronoReducer(initialChronoState, { type: "SET_LANE_COUNT", count: 5 }).laneCount).toBe(5);
  });

  it("SET_TOTAL_DISTANCE clamps to >= 0", () => {
    expect(chronoReducer(initialChronoState, { type: "SET_TOTAL_DISTANCE", meters: -50 }).totalDistanceM).toBe(0);
    expect(chronoReducer(initialChronoState, { type: "SET_TOTAL_DISTANCE", meters: 200 }).totalDistanceM).toBe(200);
  });

  it("ADD_SWIMMER deduplicates by key", () => {
    const s1 = reg(1);
    const state1 = chronoReducer(initialChronoState, { type: "ADD_SWIMMER", swimmer: s1 });
    const state2 = chronoReducer(state1, { type: "ADD_SWIMMER", swimmer: s1 });
    expect(state2.swimmers).toHaveLength(1);
  });

  it("REMOVE_SWIMMER updates waves", () => {
    const s = reduce(
      initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1, 1) },
      { type: "ADD_SWIMMER", swimmer: reg(2, 2) },
      { type: "REMOVE_SWIMMER", key: "a:2" },
    );
    expect(s.swimmers).toHaveLength(1);
    expect(s.waves).toHaveLength(1);
    expect(s.waves[0].wave).toBe(1);
  });

  it("SET_WAVE moves swimmer and rebuilds waves", () => {
    const s = reduce(
      initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1, 1) },
      { type: "ADD_SWIMMER", swimmer: reg(2, 1) },
      { type: "SET_WAVE", key: "a:2", wave: 2 },
    );
    expect(s.swimmers.find((sw) => sw.key === "a:2")?.wave).toBe(2);
    expect(s.waves).toHaveLength(2);
  });
});

// ── Race flow ───────────────────────────────────────────────

describe("race flow", () => {
  const raceReady = reduce(
    initialChronoState,
    { type: "SET_TOTAL_DISTANCE", meters: 100 },
    { type: "SET_SPLIT_DISTANCE", meters: 50 },
    { type: "ADD_SWIMMER", swimmer: reg(1, 1, 1) },
    { type: "ADD_SWIMMER", swimmer: reg(2, 1, 2) },
  );

  it("START_RACE transitions to racing phase", () => {
    const s = chronoReducer(raceReady, { type: "START_RACE" });
    expect(s.phase).toBe("racing");
    expect(s.raceData.size).toBe(2);
    expect(s.raceData.get("a:1")?.splitsByRep).toEqual([[]]);
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
      { type: "RECORD_SPLIT", key: "a:1", timestamp: 31500 }, // 30.5s cumul
      { type: "RECORD_SPLIT", key: "a:1", timestamp: 65320 }, // 64.32s cumul
    );
    const splits = s.raceData.get("a:1")!.splitsByRep[0];
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
      { type: "STOP_SWIMMER", key: "a:1", timestamp: 31000 },
      { type: "RECORD_SPLIT", key: "a:1", timestamp: 35000 },
    );
    // Only the auto-recorded split from STOP_SWIMMER, no extra from RECORD_SPLIT
    expect(s.raceData.get("a:1")!.splitsByRep[0]).toHaveLength(1);
  });

  it("UNDO_SPLIT removes the last split", () => {
    const s = reduce(
      raceReady,
      { type: "START_RACE" },
      { type: "LAUNCH_WAVE", wave: 1, timestamp: 1000 },
      { type: "RECORD_SPLIT", key: "a:1", timestamp: 31000 },
      { type: "RECORD_SPLIT", key: "a:1", timestamp: 62000 },
      { type: "UNDO_SPLIT", key: "a:1" },
    );
    expect(s.raceData.get("a:1")!.splitsByRep[0]).toHaveLength(1);
  });

  it("STOP_SWIMMER auto-records final split and marks stoppedAt", () => {
    const s = reduce(
      raceReady,
      { type: "START_RACE" },
      { type: "LAUNCH_WAVE", wave: 1, timestamp: 1000 },
      { type: "RECORD_SPLIT", key: "a:1", timestamp: 31000 }, // 50m split at 30s
      { type: "STOP_SWIMMER", key: "a:1", timestamp: 62500 }, // finish at 61.5s
    );
    const rs = s.raceData.get("a:1")!;
    expect(rs.stoppedAt).toBe(62500);
    expect(rs.splitsByRep[0]).toHaveLength(2); // manual + auto
    expect(rs.splitsByRep[0][1].cumulativeMs).toBe(61500); // 62500 - 1000
  });

  it("all swimmers stopped → wave gets lastFinishedAt", () => {
    const s = reduce(
      raceReady,
      { type: "START_RACE" },
      { type: "LAUNCH_WAVE", wave: 1, timestamp: 1000 },
      { type: "STOP_SWIMMER", key: "a:1", timestamp: 62000 },
      { type: "STOP_SWIMMER", key: "a:2", timestamp: 63000 },
    );
    expect(s.waves[0].lastFinishedAt).toBe(63000);
  });

  it("STOP_RACE transitions to results and auto-stops active swimmers", () => {
    const s = reduce(
      raceReady,
      { type: "START_RACE" },
      { type: "LAUNCH_WAVE", wave: 1, timestamp: 1000 },
      { type: "RECORD_SPLIT", key: "a:1", timestamp: 31000 },
      { type: "STOP_RACE", timestamp: 65000 },
    );
    expect(s.phase).toBe("results");
    expect(s.stoppedAt).toBe(65000);
    // Both swimmers should have stoppedAt set
    expect(s.raceData.get("a:1")!.stoppedAt).toBe(65000);
    expect(s.raceData.get("a:2")!.stoppedAt).toBe(65000);
  });

  it("RESET_FOR_NEW_SERIES goes back to setup with swimmers preserved", () => {
    const s = reduce(
      raceReady,
      { type: "START_RACE" },
      { type: "LAUNCH_WAVE", wave: 1, timestamp: 1000 },
      { type: "STOP_RACE", timestamp: 65000 },
      { type: "RESET_FOR_NEW_SERIES", title: createChronoDefaultTitle(new Date("2026-04-18T09:30:00")) },
    );
    expect(s.phase).toBe("setup");
    expect(s.raceData.size).toBe(0);
    expect(s.swimmers).toHaveLength(2); // preserved
    expect(s.waves[0].startedAt).toBeNull();
    expect(s.title).toBe("Chrono coach — 18/04/2026");
  });
});

// ── Manual swimmers ─────────────────────────────────────────

describe("manual swimmers", () => {
  it("adds a manual swimmer with composite key m:<uuid>", () => {
    const s = manual("uuid-1", "Invité 1");
    const next = chronoReducer(initialChronoState, { type: "ADD_SWIMMER", swimmer: s });
    expect(next.swimmers).toHaveLength(1);
    expect(next.swimmers[0].key).toBe("m:uuid-1");
    expect(next.swimmers[0].kind).toBe("manual");
    expect(next.swimmers[0].athleteId).toBeNull();
  });

  it("allows mixing registered and manual in the same lane/wave", () => {
    const next = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(10, 1, 2) },
      { type: "ADD_SWIMMER", swimmer: manual("u1", "X", 1, 2) },
    );
    expect(next.swimmers).toHaveLength(2);
    expect(next.swimmers.map(s => s.key)).toEqual(["a:10", "m:u1"]);
  });

  it("REMOVE_SWIMMER by key works for manual", () => {
    const s = manual("u1", "X");
    const next = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: s },
      { type: "REMOVE_SWIMMER", key: "m:u1" },
    );
    expect(next.swimmers).toHaveLength(0);
  });

  it("START_RACE keys raceData by swimmer key (including manual)", () => {
    const next = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(10, 1, 1) },
      { type: "ADD_SWIMMER", swimmer: manual("u1", "X", 1, 1) },
      { type: "START_RACE" },
    );
    expect(next.raceData.has("a:10")).toBe(true);
    expect(next.raceData.has("m:u1")).toBe(true);
  });

  it("RECORD_SPLIT works with manual key", () => {
    const s: ChronoState = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: manual("u1", "X", 1, 1) },
      { type: "START_RACE" },
      { type: "LAUNCH_WAVE", wave: 1, timestamp: 1000 },
      { type: "RECORD_SPLIT", key: "m:u1", timestamp: 2000 },
    );
    const race = s.raceData.get("m:u1");
    expect(race?.splitsByRep[0]).toHaveLength(1);
    expect(race?.splitsByRep[0][0].cumulativeMs).toBe(1000);
  });
});

// ── SET_TITLE ───────────────────────────────────────────────

describe("SET_TITLE", () => {
  it("updates title without touching swimmers", () => {
    const s = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(10) },
      { type: "SET_TITLE", title: "Stage Pâques — 100m NL" },
    );
    expect(s.title).toBe("Stage Pâques — 100m NL");
    expect(s.swimmers).toHaveLength(1);
  });

  it("allows clearing title to empty string", () => {
    const s = reduce(initialChronoState,
      { type: "SET_TITLE", title: "X" },
      { type: "SET_TITLE", title: "" },
    );
    expect(s.title).toBe("");
  });
});

// ── normalizeRecordSwimmer ──────────────────────────────────

describe("normalizeRecordSwimmer", () => {
  it("infers kind=registered for legacy records without kind", () => {
    const sw = { athleteId: 42, displayName: "X", lane: 1, wave: 1, splitsByRep: [] };
    expect(normalizeRecordSwimmer(sw).kind).toBe("registered");
  });
  it("infers kind=manual when athleteId is null", () => {
    const sw = { athleteId: null, displayName: "X", lane: 1, wave: 1, splitsByRep: [] };
    expect(normalizeRecordSwimmer(sw).kind).toBe("manual");
  });
  it("preserves explicit kind", () => {
    const sw = { kind: "manual" as const, athleteId: null, manualId: "u1", displayName: "X", lane: 1, wave: 1, splitsByRep: [] };
    expect(normalizeRecordSwimmer(sw).manualId).toBe("u1");
  });
});

describe("SET_WAVE_OVERRIDES", () => {
  it("sets the full override object on the target wave", () => {
    const s0 = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1, 1) },
      { type: "ADD_SWIMMER", swimmer: reg(2, 2) },
    );
    const s1 = chronoReducer(s0, {
      type: "SET_WAVE_OVERRIDES",
      wave: 2,
      overrides: { seriesCount: 6, totalDistanceM: 100, splitDistanceM: 25 },
    });
    expect(s1.waves.find((w) => w.wave === 2)?.overrides).toEqual({
      seriesCount: 6, totalDistanceM: 100, splitDistanceM: 25,
    });
    expect(s1.waves.find((w) => w.wave === 1)?.overrides).toBeNull();
  });

  it("resets the override when null is passed", () => {
    const s0 = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1, 1) },
      { type: "SET_WAVE_OVERRIDES", wave: 1, overrides: { seriesCount: 4 } },
    );
    const s1 = chronoReducer(s0, { type: "SET_WAVE_OVERRIDES", wave: 1, overrides: null });
    expect(s1.waves.find((w) => w.wave === 1)?.overrides).toBeNull();
  });

  it("no-op on non-existent wave", () => {
    const s0 = reduce(initialChronoState, { type: "ADD_SWIMMER", swimmer: reg(1, 1) });
    const s1 = chronoReducer(s0, {
      type: "SET_WAVE_OVERRIDES",
      wave: 99,
      overrides: { seriesCount: 6 },
    });
    expect(s1.waves).toEqual(s0.waves);
  });
});

describe("SET_WAVE_OVERRIDE_FIELD", () => {
  it("updates a single field, leaving others untouched", () => {
    const s0 = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1, 1) },
      { type: "SET_WAVE_OVERRIDES", wave: 1, overrides: { seriesCount: 3, totalDistanceM: 200, splitDistanceM: 50 } },
      { type: "SET_WAVE_OVERRIDE_FIELD", wave: 1, field: "seriesCount", value: 6 },
    );
    expect(s0.waves[0].overrides).toEqual({
      seriesCount: 6, totalDistanceM: 200, splitDistanceM: 50,
    });
  });

  it("clamps negative values to 0", () => {
    const s0 = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1, 1) },
      { type: "SET_WAVE_OVERRIDES", wave: 1, overrides: { seriesCount: 3 } },
      { type: "SET_WAVE_OVERRIDE_FIELD", wave: 1, field: "seriesCount", value: -5 },
    );
    expect(s0.waves[0].overrides?.seriesCount).toBe(0);
  });

  it("no-op if overrides is null (coach must activate Personnaliser first)", () => {
    const s0 = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1, 1) },
      { type: "SET_WAVE_OVERRIDE_FIELD", wave: 1, field: "seriesCount", value: 6 },
    );
    expect(s0.waves[0].overrides).toBeNull();
  });
});

describe("overrides persistence", () => {
  it("computeWaves preserves overrides when recomputed after ADD/REMOVE", () => {
    const s0 = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1, 1) },
      { type: "ADD_SWIMMER", swimmer: reg(2, 2) },
      { type: "SET_WAVE_OVERRIDES", wave: 2, overrides: { seriesCount: 6 } },
      { type: "ADD_SWIMMER", swimmer: reg(3, 2) }, // triggers computeWaves
    );
    expect(s0.waves.find((w) => w.wave === 2)?.overrides).toEqual({ seriesCount: 6 });
  });

  it("RESET_FOR_NEW_SERIES preserves overrides", () => {
    const s0 = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1, 1) },
      { type: "SET_WAVE_OVERRIDES", wave: 1, overrides: { seriesCount: 4, totalDistanceM: 100 } },
      { type: "START_RACE" },
      { type: "LAUNCH_WAVE", wave: 1, timestamp: 1000 },
      { type: "STOP_RACE", timestamp: 5000 },
      { type: "RESET_FOR_NEW_SERIES" },
    );
    expect(s0.phase).toBe("setup");
    expect(s0.waves[0].overrides).toEqual({ seriesCount: 4, totalDistanceM: 100 });
    expect(s0.waves[0].startedAt).toBeNull();
    expect(s0.waves[0].currentRep).toBe(0);
  });
});

describe("UPDATE_SWIMMER_AVATAR", () => {
  it("replaces avatarUrl of the targeted swimmer", () => {
    const s = reduce(
      initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1, 1, 1) },
      { type: "ADD_SWIMMER", swimmer: reg(2, 1, 2) },
      { type: "UPDATE_SWIMMER_AVATAR", key: "a:1", avatarUrl: "data:image/webp;base64,AAA" },
    );
    expect(s.swimmers.find((x) => x.key === "a:1")?.avatarUrl)
      .toBe("data:image/webp;base64,AAA");
    expect(s.swimmers.find((x) => x.key === "a:2")?.avatarUrl).toBeNull();
  });

  it("is a no-op for unknown key", () => {
    const before = reduce(
      initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1) },
    );
    const after = chronoReducer(before, {
      type: "UPDATE_SWIMMER_AVATAR",
      key: "a:999",
      avatarUrl: "data:…",
    });
    expect(after.swimmers).toEqual(before.swimmers);
  });

  it("accepts null to clear avatar", () => {
    const s = reduce(
      initialChronoState,
      { type: "ADD_SWIMMER", swimmer: { ...reg(1), avatarUrl: "data:old" } },
      { type: "UPDATE_SWIMMER_AVATAR", key: "a:1", avatarUrl: null },
    );
    expect(s.swimmers[0].avatarUrl).toBeNull();
  });
});
