import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groupSwimmersByWave } from "../chrono-race-layout";
import { buildRegisteredSwimmer } from "../chrono-types";

const sw = (id: number, wave: number, lane: number, name = `Swimmer ${id}`) =>
  buildRegisteredSwimmer({ athleteId: id, displayName: name, wave, lane });

describe("groupSwimmersByWave", () => {
  it("returns an empty array for no swimmers", () => {
    assert.deepEqual(groupSwimmersByWave([]), []);
  });

  it("groups by wave in ascending order", () => {
    const groups = groupSwimmersByWave([sw(1, 2, 1), sw(2, 1, 1)]);
    assert.deepEqual(groups.map((g) => g.wave), [1, 2]);
  });

  it("sorts swimmers within a wave by lane ascending", () => {
    const groups = groupSwimmersByWave([sw(1, 1, 3), sw(2, 1, 1), sw(3, 1, 2)]);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].swimmers.map((s) => s.lane), [1, 2, 3]);
  });

  it("breaks lane ties by display name", () => {
    const groups = groupSwimmersByWave([sw(1, 1, 1, "Zoe"), sw(2, 1, 1, "Anna")]);
    assert.deepEqual(groups[0].swimmers.map((s) => s.displayName), ["Anna", "Zoe"]);
  });

  it("only includes waves that contain swimmers", () => {
    const groups = groupSwimmersByWave([sw(1, 1, 1), sw(2, 3, 2)]);
    assert.deepEqual(groups.map((g) => g.wave), [1, 3]);
  });

  it("does not mutate the input array", () => {
    const input = [sw(1, 1, 3), sw(2, 1, 1)];
    const snapshot = input.map((s) => s.lane);
    groupSwimmersByWave(input);
    assert.deepEqual(input.map((s) => s.lane), snapshot);
  });
});
