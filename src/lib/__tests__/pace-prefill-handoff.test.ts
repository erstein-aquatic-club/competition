import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  PACE_PREFILL_KEY,
  setPacePrefill,
  consumePacePrefill,
  type PacePrefillPayload,
} from "../pace-prefill-handoff";

const memoryStore = new Map<string, string>();
const memoryStorage = {
  getItem: (k: string) => memoryStore.get(k) ?? null,
  setItem: (k: string, v: string) => { memoryStore.set(k, v); },
  removeItem: (k: string) => { memoryStore.delete(k); },
  clear: () => { memoryStore.clear(); },
} as unknown as Storage;

beforeEach(() => { memoryStore.clear(); });

describe("pace-prefill-handoff", () => {
  it("set then consume returns the payload exactly once", () => {
    const payload: PacePrefillPayload = {
      swimmer_account_id: 42,
      stroke: "NL",
      target_distance_m: 100,
      target_time_ms: 65500,
      target_pool_size: "50m",
    };
    setPacePrefill(payload, memoryStorage);
    const got = consumePacePrefill(memoryStorage);
    assert.deepEqual(got, payload);
    const second = consumePacePrefill(memoryStorage);
    assert.equal(second, null, "consume must clear the slot after first read");
  });

  it("returns null when nothing was set", () => {
    assert.equal(consumePacePrefill(memoryStorage), null);
  });

  it("returns null and clears on malformed JSON", () => {
    memoryStorage.setItem(PACE_PREFILL_KEY, "{not-json");
    assert.equal(consumePacePrefill(memoryStorage), null);
    assert.equal(memoryStorage.getItem(PACE_PREFILL_KEY), null);
  });

  it("returns null and clears on payload missing required fields", () => {
    memoryStorage.setItem(PACE_PREFILL_KEY, JSON.stringify({ stroke: "NL" }));
    assert.equal(consumePacePrefill(memoryStorage), null);
    assert.equal(memoryStorage.getItem(PACE_PREFILL_KEY), null);
  });
});
