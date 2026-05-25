import assert from "node:assert/strict";
import { describe, it, beforeEach, before, after } from "node:test";

// ── Minimal localStorage stub (Node has none) ────────────────────────────
class StorageStub {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

let restoreGlobals: () => void;

before(() => {
  const g = globalThis as Record<string, unknown>;
  const prevLocalStorage = g.localStorage;
  g.localStorage = new StorageStub();
  restoreGlobals = () => {
    g.localStorage = prevLocalStorage;
  };
});

after(() => restoreGlobals());

const {
  enqueue,
  getPending,
  flush,
  isRetriableError,
  __clearForTests,
  __setReplayerForTests,
} = await import("../chrono-save-queue");
type PendingChronoSave = import("../chrono-save-queue").PendingChronoSave;
const { STORAGE_KEYS } = await import("../api/client");

const QUEUE_KEY = STORAGE_KEYS.CHRONO_SAVE_QUEUE;

function makeRecord(): PendingChronoSave {
  return {
    kind: "record",
    createdAt: Date.now(),
    payload: {
      label: "test",
      status: "sent",
      config: { totalDistanceM: 100, splitDistanceM: 50, seriesCount: 1 },
      swimmers: [],
    } as PendingChronoSave["payload"],
  };
}

describe("chrono save queue", () => {
  beforeEach(() => {
    localStorage.clear();
    __clearForTests();
  });

  it("isRetriableError identifies network-like errors", () => {
    assert.equal(isRetriableError(new TypeError("Failed to fetch")), true);
    assert.equal(isRetriableError(new Error("NetworkError when attempting…")), true);
    assert.equal(isRetriableError(new Error("invalid input syntax")), false);
    assert.equal(isRetriableError(null), false);
  });

  it("enqueue persists item to localStorage", () => {
    enqueue(makeRecord());
    assert.equal(getPending().length, 1);
    assert.equal(JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]").length, 1);
  });

  it("getPending returns [] on corrupted JSON", () => {
    localStorage.setItem(QUEUE_KEY, "{bad json");
    assert.deepEqual(getPending(), []);
  });

  it("flush removes entries when replay succeeds", async () => {
    __setReplayerForTests(async () => {
      /* ok */
    });
    enqueue(makeRecord());
    enqueue(makeRecord());
    const res = await flush();
    assert.deepEqual(res, { succeeded: 2, failed: 0 });
    assert.equal(getPending().length, 0);
  });

  it("flush keeps entry when replay fails with retriable error", async () => {
    __setReplayerForTests(async () => {
      throw new TypeError("Failed to fetch");
    });
    enqueue(makeRecord());
    const res = await flush();
    assert.deepEqual(res, { succeeded: 0, failed: 1 });
    assert.equal(getPending().length, 1);
  });

  it("flush drops entry when replay fails with non-retriable error", async () => {
    __setReplayerForTests(async () => {
      throw new Error("Forbidden");
    });
    enqueue(makeRecord());
    const res = await flush();
    assert.deepEqual(res, { succeeded: 0, failed: 1 });
    assert.equal(getPending().length, 0); // dropped to avoid infinite loop
  });
});
