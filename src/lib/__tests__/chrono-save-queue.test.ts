import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  enqueue,
  getPending,
  flush,
  isRetriableError,
  __clearForTests,
  __setReplayerForTests,
  type PendingChronoSave,
} from "../chrono-save-queue";
import { STORAGE_KEYS } from "../api/client";

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
    } as any,
  };
}

describe("chrono save queue", () => {
  beforeEach(() => {
    localStorage.clear();
    __clearForTests();
  });

  it("isRetriableError identifies network-like errors", () => {
    expect(isRetriableError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRetriableError(new Error("NetworkError when attempting…"))).toBe(true);
    expect(isRetriableError(new Error("invalid input syntax"))).toBe(false);
    expect(isRetriableError(null)).toBe(false);
  });

  it("enqueue persists item to localStorage", () => {
    enqueue(makeRecord());
    expect(getPending()).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]")).toHaveLength(1);
  });

  it("getPending returns [] on corrupted JSON", () => {
    localStorage.setItem(QUEUE_KEY, "{bad json");
    expect(getPending()).toEqual([]);
  });

  it("flush removes entries when replay succeeds", async () => {
    __setReplayerForTests(async () => { /* ok */ });
    enqueue(makeRecord());
    enqueue(makeRecord());
    const res = await flush();
    expect(res).toEqual({ succeeded: 2, failed: 0 });
    expect(getPending()).toHaveLength(0);
  });

  it("flush keeps entry when replay fails with retriable error", async () => {
    __setReplayerForTests(async () => { throw new TypeError("Failed to fetch"); });
    enqueue(makeRecord());
    const res = await flush();
    expect(res).toEqual({ succeeded: 0, failed: 1 });
    expect(getPending()).toHaveLength(1);
  });

  it("flush drops entry when replay fails with non-retriable error", async () => {
    __setReplayerForTests(async () => { throw new Error("Forbidden"); });
    enqueue(makeRecord());
    const res = await flush();
    expect(res).toEqual({ succeeded: 0, failed: 1 });
    expect(getPending()).toHaveLength(0); // dropped to avoid infinite loop
  });
});
