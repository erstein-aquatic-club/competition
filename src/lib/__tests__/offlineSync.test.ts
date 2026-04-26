import { describe, it, expect, beforeEach, vi } from "vitest";
import { runSyncOnce, __resetMutex } from "@/lib/offlineSync";
import { isTransientError } from "@/lib/offlineQueue";

describe("offlineSync mutex", () => {
  beforeEach(() => __resetMutex());

  it("two concurrent runSyncOnce calls execute the task only once", async () => {
    const task = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await Promise.all([runSyncOnce(task), runSyncOnce(task)]);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("releases the lock so the next call can run", async () => {
    const task = vi.fn(async () => {});
    await runSyncOnce(task);
    await runSyncOnce(task);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("releases the lock even if the task throws", async () => {
    const failing = vi.fn(async () => { throw new Error("boom"); });
    await expect(runSyncOnce(failing)).rejects.toThrow("boom");
    const ok = vi.fn(async () => {});
    await runSyncOnce(ok);
    expect(ok).toHaveBeenCalledTimes(1);
  });
});

describe("isTransientError", () => {
  it("returns true for 'Failed to fetch'", () => {
    expect(isTransientError(new Error("Failed to fetch"))).toBe(true);
  });
  it("returns true for any 5xx in message", () => {
    expect(isTransientError(new Error("503 Service Unavailable"))).toBe(true);
    expect(isTransientError(new Error("HTTP 502"))).toBe(true);
  });
  it("returns true for 'network' or 'timeout'", () => {
    expect(isTransientError(new Error("Network request failed"))).toBe(true);
    expect(isTransientError(new Error("rpc: timeout after 10000ms"))).toBe(true);
  });
  it("returns false for permanent errors (4xx, RLS)", () => {
    expect(isTransientError(new Error("forbidden: 42501"))).toBe(false);
    expect(isTransientError(new Error("400 Bad Request"))).toBe(false);
    expect(isTransientError(new Error("violates row-level security"))).toBe(false);
  });
  it("returns false for non-Error inputs", () => {
    expect(isTransientError("string")).toBe(false);
    expect(isTransientError(null)).toBe(false);
  });
});
