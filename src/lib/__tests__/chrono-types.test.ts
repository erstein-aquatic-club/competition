import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveWaveConfig } from "../chrono-types";
import type { ChronoState } from "../chrono-types";

function baseState(): Pick<ChronoState, "seriesCount" | "totalDistanceM" | "splitDistanceM" | "waves"> {
  return {
    seriesCount: 3,
    totalDistanceM: 200,
    splitDistanceM: 50,
    waves: [
      { wave: 1, startedAt: null, stopped: false, currentRep: 0, departureIntervalSec: 0, lastFinishedAt: null, overrides: null },
      { wave: 2, startedAt: null, stopped: false, currentRep: 0, departureIntervalSec: 0, lastFinishedAt: null, overrides: null },
    ],
  };
}

describe("resolveWaveConfig", () => {
  it("falls back to global when wave not found", () => {
    const s = baseState();
    assert.deepEqual(resolveWaveConfig(s, 99), {
      seriesCount: 3, totalDistanceM: 200, splitDistanceM: 50,
    });
  });

  it("falls back to global when overrides is null", () => {
    const s = baseState();
    assert.deepEqual(resolveWaveConfig(s, 1), {
      seriesCount: 3, totalDistanceM: 200, splitDistanceM: 50,
    });
  });

  it("merges partial override with global", () => {
    const s = baseState();
    s.waves[1].overrides = { seriesCount: 6 };
    assert.deepEqual(resolveWaveConfig(s, 2), {
      seriesCount: 6, totalDistanceM: 200, splitDistanceM: 50,
    });
  });

  it("returns full override when all fields set", () => {
    const s = baseState();
    s.waves[1].overrides = { seriesCount: 6, totalDistanceM: 100, splitDistanceM: 25 };
    assert.deepEqual(resolveWaveConfig(s, 2), {
      seriesCount: 6, totalDistanceM: 100, splitDistanceM: 25,
    });
  });
});
