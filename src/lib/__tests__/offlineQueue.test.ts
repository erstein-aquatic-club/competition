import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  enqueue,
  getQueue,
  clearQueue,
  markRetry,
  MAX_RETRY_ATTEMPTS,
  QUEUE_UPDATED_EVENT,
} from "@/lib/offlineQueue";

describe("offlineQueue.enqueue", () => {
  beforeEach(() => {
    clearQueue();
  });

  it("enqueues an item and dispatches QUEUE_UPDATED_EVENT", () => {
    const handler = vi.fn();
    window.addEventListener(QUEUE_UPDATED_EVENT, handler);
    enqueue("test", { foo: "bar" });
    expect(getQueue()).toHaveLength(1);
    expect(handler).toHaveBeenCalledOnce();
    window.removeEventListener(QUEUE_UPDATED_EVENT, handler);
  });

  it("preserves FIFO order across multiple enqueues", () => {
    enqueue("first", { idx: 1 });
    enqueue("second", { idx: 2 });
    enqueue("third", { idx: 3 });
    const queue = getQueue();
    expect(queue.map((q) => q.payload.idx)).toEqual([1, 2, 3]);
  });

  it("throws a typed QuotaError when localStorage is full", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = vi.fn(() => {
      const err = new Error("QuotaExceededError") as Error & { name: string };
      err.name = "QuotaExceededError";
      throw err;
    });
    try {
      expect(() => enqueue("overflow", { x: 1 })).toThrow(/quota|storage full/i);
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it("does NOT dispatch the event when persist fails", () => {
    const handler = vi.fn();
    window.addEventListener(QUEUE_UPDATED_EVENT, handler);
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = vi.fn(() => {
      const err = new Error("QuotaExceededError") as Error & { name: string };
      err.name = "QuotaExceededError";
      throw err;
    });
    try {
      try { enqueue("overflow", {}); } catch { /* expected */ }
      expect(handler).not.toHaveBeenCalled();
    } finally {
      Storage.prototype.setItem = original;
      window.removeEventListener(QUEUE_UPDATED_EVENT, handler);
    }
  });
});

describe("offlineQueue.markRetry / poisoning", () => {
  beforeEach(() => clearQueue());

  it("drops an item after MAX_RETRY_ATTEMPTS", () => {
    enqueue("flaky", {});
    const id = getQueue()[0].id;
    for (let i = 0; i < MAX_RETRY_ATTEMPTS - 1; i++) {
      expect(markRetry(id)).toBe(false);
    }
    expect(markRetry(id)).toBe(true);
    expect(getQueue()).toHaveLength(0);
  });
});
