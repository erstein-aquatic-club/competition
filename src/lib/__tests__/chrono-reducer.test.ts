import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
    assert.equal(formatTime(0), "0:00.00");
  });

  it("formats 65320ms as 1:05.32", () => {
    assert.equal(formatTime(65320), "1:05.32");
  });

  it("formats 30010ms as 0:30.01", () => {
    assert.equal(formatTime(30010), "0:30.01");
  });

  it("formats 125ms as 0:00.13 (rounds half-up)", () => {
    // 125ms = 0.125s → toFixed(2) = "0.13" (banker's rounding varies, 0.12 or 0.13)
    const result = formatTime(125);
    assert.match(result, /^0:00\.1[23]$/);
  });

  it("formats sub-second times correctly", () => {
    assert.equal(formatTime(500), "0:00.50");
  });

  it("returns placeholder for negative ms", () => {
    assert.equal(formatTime(-1), "--:--.--");
  });
});

describe("formatLap (centièmes)", () => {
  it("formats 32510ms as 32.51", () => {
    assert.equal(formatLap(32510), "32.51");
  });

  it("delegates to formatTime for >= 60s", () => {
    assert.equal(formatLap(65000), "1:05.00");
  });

  it("returns placeholder for negative", () => {
    assert.equal(formatLap(-1), "--.--");
  });

  it("formats exact seconds without trailing zeros", () => {
    assert.equal(formatLap(30000), "30.00");
  });
});

// ── computeWaves ────────────────────────────────────────────

describe("computeWaves", () => {
  it("creates waves from swimmer wave numbers", () => {
    const swimmers = [reg(1, 1), reg(2, 2), reg(3, 1)];
    const waves = computeWaves(swimmers);
    assert.equal(waves.length, 2);
    assert.equal(waves[0].wave, 1);
    assert.equal(waves[1].wave, 2);
  });

  it("preserves existing wave state when swimmers change", () => {
    const existing = [
      { wave: 1, startedAt: 1000, stopped: false, currentRep: 2, departureIntervalSec: 10, lastFinishedAt: null },
    ];
    const swimmers = [reg(1, 1), reg(2, 1)];
    const waves = computeWaves(swimmers, existing);
    assert.equal(waves[0].startedAt, 1000);
    assert.equal(waves[0].currentRep, 2);
  });

  it("returns empty array for no swimmers", () => {
    assert.deepEqual(computeWaves([]), []);
  });

  it("seeds new waves with the default departure interval", () => {
    const waves = computeWaves([reg(1, 1), reg(2, 2)], [], 90);
    assert.equal(waves[0].departureIntervalSec, 90);
    assert.equal(waves[1].departureIntervalSec, 90);
  });

  it("preserves an existing wave's interval over the default seed", () => {
    const existing = [
      { wave: 1, startedAt: null, stopped: false, currentRep: 0, departureIntervalSec: 30, lastFinishedAt: null, overrides: null },
    ];
    const waves = computeWaves([reg(1, 1), reg(2, 2)], existing, 90);
    assert.equal(waves[0].departureIntervalSec, 30); // kept
    assert.equal(waves[1].departureIntervalSec, 90); // seeded
  });
});

// ── SET_DEFAULT_DEPARTURE ───────────────────────────────────

describe("SET_DEFAULT_DEPARTURE", () => {
  it("stores the default and clamps negatives to 0", () => {
    assert.equal(chronoReducer(initialChronoState, { type: "SET_DEFAULT_DEPARTURE", seconds: 90 }).defaultDepartureSec, 90);
    assert.equal(chronoReducer(initialChronoState, { type: "SET_DEFAULT_DEPARTURE", seconds: -5 }).defaultDepartureSec, 0);
  });

  it("propagates to every existing wave", () => {
    const withSwimmers = chronoReducer(
      chronoReducer(initialChronoState, { type: "ADD_SWIMMER", swimmer: reg(1, 1) }),
      { type: "ADD_SWIMMER", swimmer: reg(2, 2) },
    );
    const next = chronoReducer(withSwimmers, { type: "SET_DEFAULT_DEPARTURE", seconds: 75 });
    assert.deepEqual(next.waves.map((w) => w.departureIntervalSec), [75, 75]);
  });

  it("seeds a wave added after the default is set", () => {
    const withDefault = chronoReducer(initialChronoState, { type: "SET_DEFAULT_DEPARTURE", seconds: 60 });
    const next = chronoReducer(withDefault, { type: "ADD_SWIMMER", swimmer: reg(1, 1) });
    assert.equal(next.waves[0].departureIntervalSec, 60);
  });
});

// ── Setup phase actions ─────────────────────────────────────

describe("setup actions", () => {
  it("createInitialChronoState seeds a dated default title", () => {
    const state = createInitialChronoState(new Date("2026-04-18T09:30:00"));
    assert.equal(state.title, "Chrono coach — 18/04/2026");
  });

  it("SET_LANE_COUNT clamps to [1, 8]", () => {
    assert.equal(chronoReducer(initialChronoState, { type: "SET_LANE_COUNT", count: 0 }).laneCount, 1);
    assert.equal(chronoReducer(initialChronoState, { type: "SET_LANE_COUNT", count: 10 }).laneCount, 8);
    assert.equal(chronoReducer(initialChronoState, { type: "SET_LANE_COUNT", count: 5 }).laneCount, 5);
  });

  it("SET_TOTAL_DISTANCE clamps to >= 0", () => {
    assert.equal(chronoReducer(initialChronoState, { type: "SET_TOTAL_DISTANCE", meters: -50 }).totalDistanceM, 0);
    assert.equal(chronoReducer(initialChronoState, { type: "SET_TOTAL_DISTANCE", meters: 200 }).totalDistanceM, 200);
  });

  it("ADD_SWIMMER deduplicates by key", () => {
    const s1 = reg(1);
    const state1 = chronoReducer(initialChronoState, { type: "ADD_SWIMMER", swimmer: s1 });
    const state2 = chronoReducer(state1, { type: "ADD_SWIMMER", swimmer: s1 });
    assert.equal(state2.swimmers.length, 1);
  });

  it("REMOVE_SWIMMER updates waves", () => {
    const s = reduce(
      initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1, 1) },
      { type: "ADD_SWIMMER", swimmer: reg(2, 2) },
      { type: "REMOVE_SWIMMER", key: "a:2" },
    );
    assert.equal(s.swimmers.length, 1);
    assert.equal(s.waves.length, 1);
    assert.equal(s.waves[0].wave, 1);
  });

  it("SET_WAVE moves swimmer and rebuilds waves", () => {
    const s = reduce(
      initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1, 1) },
      { type: "ADD_SWIMMER", swimmer: reg(2, 1) },
      { type: "SET_WAVE", key: "a:2", wave: 2 },
    );
    assert.equal(s.swimmers.find((sw) => sw.key === "a:2")?.wave, 2);
    assert.equal(s.waves.length, 2);
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
    assert.equal(s.phase, "racing");
    assert.equal(s.raceData.size, 2);
    assert.deepEqual(s.raceData.get("a:1")?.splitsByRep, [[]]);
  });

  it("LAUNCH_WAVE sets startedAt timestamp", () => {
    const s = reduce(raceReady, { type: "START_RACE" }, { type: "LAUNCH_WAVE", wave: 1, timestamp: 1000 });
    assert.equal(s.waves[0].startedAt, 1000);
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
    assert.equal(splits.length, 2);
    assert.equal(splits[0].cumulativeMs, 30500);
    assert.equal(splits[0].lapMs, 30500);
    assert.equal(splits[1].cumulativeMs, 64320);
    assert.equal(splits[1].lapMs, 33820); // 64320 - 30500
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
    assert.equal(s.raceData.get("a:1")!.splitsByRep[0].length, 1);
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
    assert.equal(s.raceData.get("a:1")!.splitsByRep[0].length, 1);
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
    assert.equal(rs.stoppedAt, 62500);
    assert.equal(rs.splitsByRep[0].length, 2); // manual + auto
    assert.equal(rs.splitsByRep[0][1].cumulativeMs, 61500); // 62500 - 1000
  });

  it("all swimmers stopped → wave gets lastFinishedAt", () => {
    const s = reduce(
      raceReady,
      { type: "START_RACE" },
      { type: "LAUNCH_WAVE", wave: 1, timestamp: 1000 },
      { type: "STOP_SWIMMER", key: "a:1", timestamp: 62000 },
      { type: "STOP_SWIMMER", key: "a:2", timestamp: 63000 },
    );
    assert.equal(s.waves[0].lastFinishedAt, 63000);
  });

  it("STOP_RACE transitions to results and auto-stops active swimmers", () => {
    const s = reduce(
      raceReady,
      { type: "START_RACE" },
      { type: "LAUNCH_WAVE", wave: 1, timestamp: 1000 },
      { type: "RECORD_SPLIT", key: "a:1", timestamp: 31000 },
      { type: "STOP_RACE", timestamp: 65000 },
    );
    assert.equal(s.phase, "results");
    assert.equal(s.stoppedAt, 65000);
    // Both swimmers should have stoppedAt set
    assert.equal(s.raceData.get("a:1")!.stoppedAt, 65000);
    assert.equal(s.raceData.get("a:2")!.stoppedAt, 65000);
  });

  it("RESET_FOR_NEW_SERIES goes back to setup with swimmers preserved", () => {
    const s = reduce(
      raceReady,
      { type: "START_RACE" },
      { type: "LAUNCH_WAVE", wave: 1, timestamp: 1000 },
      { type: "STOP_RACE", timestamp: 65000 },
      { type: "RESET_FOR_NEW_SERIES", title: createChronoDefaultTitle(new Date("2026-04-18T09:30:00")) },
    );
    assert.equal(s.phase, "setup");
    assert.equal(s.raceData.size, 0);
    assert.equal(s.swimmers.length, 2); // preserved
    assert.equal(s.waves[0].startedAt, null);
    assert.equal(s.title, "Chrono coach — 18/04/2026");
  });
});

// ── Manual swimmers ─────────────────────────────────────────

describe("manual swimmers", () => {
  it("adds a manual swimmer with composite key m:<uuid>", () => {
    const s = manual("uuid-1", "Invité 1");
    const next = chronoReducer(initialChronoState, { type: "ADD_SWIMMER", swimmer: s });
    assert.equal(next.swimmers.length, 1);
    assert.equal(next.swimmers[0].key, "m:uuid-1");
    assert.equal(next.swimmers[0].kind, "manual");
    assert.equal(next.swimmers[0].athleteId, null);
  });

  it("allows mixing registered and manual in the same lane/wave", () => {
    const next = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(10, 1, 2) },
      { type: "ADD_SWIMMER", swimmer: manual("u1", "X", 1, 2) },
    );
    assert.equal(next.swimmers.length, 2);
    assert.deepEqual(next.swimmers.map(s => s.key), ["a:10", "m:u1"]);
  });

  it("REMOVE_SWIMMER by key works for manual", () => {
    const s = manual("u1", "X");
    const next = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: s },
      { type: "REMOVE_SWIMMER", key: "m:u1" },
    );
    assert.equal(next.swimmers.length, 0);
  });

  it("START_RACE keys raceData by swimmer key (including manual)", () => {
    const next = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(10, 1, 1) },
      { type: "ADD_SWIMMER", swimmer: manual("u1", "X", 1, 1) },
      { type: "START_RACE" },
    );
    assert.equal(next.raceData.has("a:10"), true);
    assert.equal(next.raceData.has("m:u1"), true);
  });

  it("RECORD_SPLIT works with manual key", () => {
    const s: ChronoState = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: manual("u1", "X", 1, 1) },
      { type: "START_RACE" },
      { type: "LAUNCH_WAVE", wave: 1, timestamp: 1000 },
      { type: "RECORD_SPLIT", key: "m:u1", timestamp: 2000 },
    );
    const race = s.raceData.get("m:u1");
    assert.equal(race?.splitsByRep[0].length, 1);
    assert.equal(race?.splitsByRep[0][0].cumulativeMs, 1000);
  });
});

// ── SET_TITLE ───────────────────────────────────────────────

describe("SET_TITLE", () => {
  it("updates title without touching swimmers", () => {
    const s = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(10) },
      { type: "SET_TITLE", title: "Stage Pâques — 100m NL" },
    );
    assert.equal(s.title, "Stage Pâques — 100m NL");
    assert.equal(s.swimmers.length, 1);
  });

  it("allows clearing title to empty string", () => {
    const s = reduce(initialChronoState,
      { type: "SET_TITLE", title: "X" },
      { type: "SET_TITLE", title: "" },
    );
    assert.equal(s.title, "");
  });
});

// ── normalizeRecordSwimmer ──────────────────────────────────

describe("normalizeRecordSwimmer", () => {
  it("infers kind=registered for legacy records without kind", () => {
    const sw = { athleteId: 42, displayName: "X", lane: 1, wave: 1, splitsByRep: [] };
    assert.equal(normalizeRecordSwimmer(sw).kind, "registered");
  });
  it("infers kind=manual when athleteId is null", () => {
    const sw = { athleteId: null, displayName: "X", lane: 1, wave: 1, splitsByRep: [] };
    assert.equal(normalizeRecordSwimmer(sw).kind, "manual");
  });
  it("preserves explicit kind", () => {
    const sw = { kind: "manual" as const, athleteId: null, manualId: "u1", displayName: "X", lane: 1, wave: 1, splitsByRep: [] };
    assert.equal(normalizeRecordSwimmer(sw).manualId, "u1");
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
    assert.deepEqual(s1.waves.find((w) => w.wave === 2)?.overrides, {
      seriesCount: 6, totalDistanceM: 100, splitDistanceM: 25,
    });
    assert.equal(s1.waves.find((w) => w.wave === 1)?.overrides, null);
  });

  it("resets the override when null is passed", () => {
    const s0 = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1, 1) },
      { type: "SET_WAVE_OVERRIDES", wave: 1, overrides: { seriesCount: 4 } },
    );
    const s1 = chronoReducer(s0, { type: "SET_WAVE_OVERRIDES", wave: 1, overrides: null });
    assert.equal(s1.waves.find((w) => w.wave === 1)?.overrides, null);
  });

  it("no-op on non-existent wave", () => {
    const s0 = reduce(initialChronoState, { type: "ADD_SWIMMER", swimmer: reg(1, 1) });
    const s1 = chronoReducer(s0, {
      type: "SET_WAVE_OVERRIDES",
      wave: 99,
      overrides: { seriesCount: 6 },
    });
    assert.deepEqual(s1.waves, s0.waves);
  });
});

describe("SET_WAVE_OVERRIDE_FIELD", () => {
  it("updates a single field, leaving others untouched", () => {
    const s0 = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1, 1) },
      { type: "SET_WAVE_OVERRIDES", wave: 1, overrides: { seriesCount: 3, totalDistanceM: 200, splitDistanceM: 50 } },
      { type: "SET_WAVE_OVERRIDE_FIELD", wave: 1, field: "seriesCount", value: 6 },
    );
    assert.deepEqual(s0.waves[0].overrides, {
      seriesCount: 6, totalDistanceM: 200, splitDistanceM: 50,
    });
  });

  it("clamps negative values to 0", () => {
    const s0 = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1, 1) },
      { type: "SET_WAVE_OVERRIDES", wave: 1, overrides: { seriesCount: 3 } },
      { type: "SET_WAVE_OVERRIDE_FIELD", wave: 1, field: "seriesCount", value: -5 },
    );
    assert.equal(s0.waves[0].overrides?.seriesCount, 0);
  });

  it("no-op if overrides is null (coach must activate Personnaliser first)", () => {
    const s0 = reduce(initialChronoState,
      { type: "ADD_SWIMMER", swimmer: reg(1, 1) },
      { type: "SET_WAVE_OVERRIDE_FIELD", wave: 1, field: "seriesCount", value: 6 },
    );
    assert.equal(s0.waves[0].overrides, null);
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
    assert.deepEqual(s0.waves.find((w) => w.wave === 2)?.overrides, { seriesCount: 6 });
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
    assert.equal(s0.phase, "setup");
    assert.deepEqual(s0.waves[0].overrides, { seriesCount: 4, totalDistanceM: 100 });
    assert.equal(s0.waves[0].startedAt, null);
    assert.equal(s0.waves[0].currentRep, 0);
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
    assert.equal(
      s.swimmers.find((x) => x.key === "a:1")?.avatarUrl,
      "data:image/webp;base64,AAA",
    );
    assert.equal(s.swimmers.find((x) => x.key === "a:2")?.avatarUrl, null);
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
    assert.deepEqual(after.swimmers, before.swimmers);
  });

  it("accepts null to clear avatar", () => {
    const s = reduce(
      initialChronoState,
      { type: "ADD_SWIMMER", swimmer: { ...reg(1), avatarUrl: "data:old" } },
      { type: "UPDATE_SWIMMER_AVATAR", key: "a:1", avatarUrl: null },
    );
    assert.equal(s.swimmers[0].avatarUrl, null);
  });
});
