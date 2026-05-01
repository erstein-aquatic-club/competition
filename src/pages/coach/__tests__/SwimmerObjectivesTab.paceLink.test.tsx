import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { setPacePrefill, consumePacePrefill } from "@/lib/pace-prefill-handoff";
import { handlePaceLinkClick } from "../SwimmerObjectivesTab";

const memoryStore = new Map<string, string>();
const memoryStorage = {
  getItem: (k: string) => memoryStore.get(k) ?? null,
  setItem: (k: string, v: string) => { memoryStore.set(k, v); },
  removeItem: (k: string) => { memoryStore.delete(k); },
  clear: () => { memoryStore.clear(); },
} as unknown as Storage;

beforeEach(() => { memoryStore.clear(); });

describe("SwimmerObjectivesTab — handlePaceLinkClick", () => {
  it("writes pace prefill to sessionStorage and returns the target URL hash", () => {
    const url = handlePaceLinkClick(
      { stroke: "NL", distance: 100, pool_size: "50m" },
      42,
      65500,
      memoryStorage,
    );
    assert.equal(url, "#/coach?section=pace-calculator");
    const consumed = consumePacePrefill(memoryStorage);
    assert.deepEqual(consumed, {
      swimmer_account_id: 42,
      stroke: "NL",
      target_distance_m: 100,
      target_time_ms: 65500,
      target_pool_size: "50m",
    });
  });
});
