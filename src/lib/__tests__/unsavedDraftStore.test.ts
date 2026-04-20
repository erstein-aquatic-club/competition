import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  saveDraft,
  loadDraft,
  clearDraft,
  __UNSAFE_INTERNALS__,
} from "../unsavedDraftStore";

const { PREFIX } = __UNSAFE_INTERNALS__;

// Minimal in-memory localStorage shim (node --test has no jsdom).
class MemoryStorage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  key(i: number) { return Array.from(this.store.keys())[i] ?? null; }
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, String(v)); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

const installFreshStorage = () => {
  const storage = new MemoryStorage();
  // Install both `window` and `localStorage` so the util's `hasStorage` guard passes.
  (globalThis as any).window = { localStorage: storage };
  (globalThis as any).localStorage = storage;
  return storage;
};

describe("unsavedDraftStore", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = installFreshStorage();
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
  });

  it("round-trips a draft payload", () => {
    const key = "workout_runner:42";
    const payload = { step: 3, logs: [{ reps: 10, weight: 40 }] };
    saveDraft(key, payload);
    const loaded = loadDraft<typeof payload>(key);
    assert.ok(loaded, "expected non-null load");
    assert.deepEqual(loaded!.payload, payload);
    assert.equal(typeof loaded!.savedAt, "number");
    assert.ok(loaded!.savedAt > 0);
  });

  it("returns null for a missing key", () => {
    assert.equal(loadDraft("does_not_exist"), null);
  });

  it("returns null for a corrupted blob without throwing", () => {
    storage.setItem(`${PREFIX}bad`, "{not valid json");
    assert.doesNotThrow(() => loadDraft("bad"));
    assert.equal(loadDraft("bad"), null);
  });

  it("returns null for wrong envelope shape", () => {
    storage.setItem(`${PREFIX}shape`, JSON.stringify({ hello: 1 }));
    assert.equal(loadDraft("shape"), null);
    storage.setItem(
      `${PREFIX}shape2`,
      JSON.stringify({ v: 999, savedAt: 1, payload: {} }),
    );
    assert.equal(loadDraft("shape2"), null);
  });

  it("clears a persisted draft", () => {
    saveDraft("to_clear", { a: 1 });
    assert.ok(loadDraft("to_clear"));
    clearDraft("to_clear");
    assert.equal(loadDraft("to_clear"), null);
  });

  it("swallows quota-exceeded errors on save", () => {
    const originalSet = MemoryStorage.prototype.setItem;
    MemoryStorage.prototype.setItem = function () {
      throw new Error("QuotaExceededError");
    };
    try {
      assert.doesNotThrow(() =>
        saveDraft("quota", { big: "x".repeat(10) }),
      );
    } finally {
      MemoryStorage.prototype.setItem = originalSet;
    }
  });

  it("swallows errors on clear", () => {
    const originalRemove = MemoryStorage.prototype.removeItem;
    MemoryStorage.prototype.removeItem = function () {
      throw new Error("locked");
    };
    try {
      assert.doesNotThrow(() => clearDraft("whatever"));
    } finally {
      MemoryStorage.prototype.removeItem = originalRemove;
    }
  });

  it("swallows errors on load when getItem throws", () => {
    const originalGet = MemoryStorage.prototype.getItem;
    MemoryStorage.prototype.getItem = function () {
      throw new Error("locked");
    };
    try {
      assert.doesNotThrow(() => loadDraft("x"));
      assert.equal(loadDraft("x"), null);
    } finally {
      MemoryStorage.prototype.getItem = originalGet;
    }
  });

  it("is a no-op when window.localStorage is absent", () => {
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
    assert.doesNotThrow(() => saveDraft("a", { v: 1 }));
    assert.equal(loadDraft("a"), null);
    assert.doesNotThrow(() => clearDraft("a"));
  });
});
