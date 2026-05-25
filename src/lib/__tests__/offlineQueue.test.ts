import assert from "node:assert/strict";
import { describe, it, beforeEach, before, after, mock } from "node:test";

// ── Minimal DOM globals (Node has no localStorage/Storage/window) ─────────
// The production offlineQueue uses localStorage + window.dispatchEvent(CustomEvent).
// Storage is a class so the quota tests can override Storage.prototype.setItem
// exactly like the original (jsdom-style) test did. CustomEvent exists in Node 24.
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
  const prevStorage = g.Storage;
  const prevLocalStorage = g.localStorage;
  const prevWindow = g.window;
  g.Storage = StorageStub;
  g.localStorage = new StorageStub();
  g.window = new EventTarget();
  restoreGlobals = () => {
    g.Storage = prevStorage;
    g.localStorage = prevLocalStorage;
    g.window = prevWindow;
  };
});

after(() => restoreGlobals());

// Imported after globals are installed (offlineQueue reads them at call time,
// not import time, but keep the dynamic import for clarity/safety).
const {
  enqueue,
  getQueue,
  peekQueue,
  clearQueue,
  markRetry,
  MAX_RETRY_ATTEMPTS,
  QUEUE_UPDATED_EVENT,
} = await import("@/lib/offlineQueue");

describe("offlineQueue.enqueue", () => {
  beforeEach(() => {
    clearQueue();
  });

  it("enqueues an item and dispatches QUEUE_UPDATED_EVENT", () => {
    const handler = mock.fn();
    window.addEventListener(QUEUE_UPDATED_EVENT, handler);
    enqueue("test", { foo: "bar" });
    assert.equal(getQueue().length, 1);
    assert.equal(handler.mock.callCount(), 1);
    window.removeEventListener(QUEUE_UPDATED_EVENT, handler);
  });

  it("preserves FIFO order across multiple enqueues", () => {
    enqueue("first", { idx: 1 });
    enqueue("second", { idx: 2 });
    enqueue("third", { idx: 3 });
    const queue = getQueue();
    assert.deepEqual(
      queue.map((q) => q.payload.idx),
      [1, 2, 3],
    );
  });

  it("throws a typed QuotaError when localStorage is full", () => {
    const original = StorageStub.prototype.setItem;
    StorageStub.prototype.setItem = mock.fn(() => {
      const err = new Error("QuotaExceededError") as Error & { name: string };
      err.name = "QuotaExceededError";
      throw err;
    });
    try {
      assert.throws(() => enqueue("overflow", { x: 1 }), /quota|storage full/i);
    } finally {
      StorageStub.prototype.setItem = original;
    }
  });

  it("does NOT dispatch the event when persist fails", () => {
    const handler = mock.fn();
    window.addEventListener(QUEUE_UPDATED_EVENT, handler);
    const original = StorageStub.prototype.setItem;
    StorageStub.prototype.setItem = mock.fn(() => {
      const err = new Error("QuotaExceededError") as Error & { name: string };
      err.name = "QuotaExceededError";
      throw err;
    });
    try {
      try {
        enqueue("overflow", {});
      } catch {
        /* expected */
      }
      assert.equal(handler.mock.callCount(), 0);
    } finally {
      StorageStub.prototype.setItem = original;
      window.removeEventListener(QUEUE_UPDATED_EVENT, handler);
    }
  });
});

describe("offlineQueue.idempotency", () => {
  beforeEach(() => clearQueue());

  it("rejects duplicate idempotencyKey within same queue", () => {
    enqueue("saveSwimSession", { sessionId: 42, logs: [] }, "user-1-2026-05-10-morning");
    enqueue("saveSwimSession", { sessionId: 42, logs: [] }, "user-1-2026-05-10-morning");
    assert.equal(peekQueue().length, 1);
  });

  it("allows distinct idempotencyKeys", () => {
    enqueue("saveSwimSession", { sessionId: 42 }, "key-A");
    enqueue("saveSwimSession", { sessionId: 43 }, "key-B");
    assert.equal(peekQueue().length, 2);
  });

  it("allows re-enqueue without a key (no dedup)", () => {
    enqueue("saveSwimSession", { sessionId: 42 });
    enqueue("saveSwimSession", { sessionId: 42 });
    assert.equal(peekQueue().length, 2);
  });
});

describe("offlineQueue.markRetry / poisoning", () => {
  beforeEach(() => clearQueue());

  it("drops an item after MAX_RETRY_ATTEMPTS", () => {
    enqueue("flaky", {});
    const id = getQueue()[0].id;
    for (let i = 0; i < MAX_RETRY_ATTEMPTS - 1; i++) {
      assert.equal(markRetry(id), false);
    }
    assert.equal(markRetry(id), true);
    assert.equal(getQueue().length, 0);
  });
});
