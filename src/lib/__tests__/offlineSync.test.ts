import assert from "node:assert/strict";
import { describe, it, beforeEach, mock } from "node:test";
import { runSyncOnce, __resetMutex } from "@/lib/offlineSync";
import { isTransientError } from "@/lib/offlineQueue";

describe("offlineSync mutex", () => {
  beforeEach(() => __resetMutex());

  it("two concurrent runSyncOnce calls execute the task only once", async () => {
    const task = mock.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await Promise.all([runSyncOnce(task), runSyncOnce(task)]);
    assert.equal(task.mock.callCount(), 1);
  });

  it("releases the lock so the next call can run", async () => {
    const task = mock.fn(async () => {});
    await runSyncOnce(task);
    await runSyncOnce(task);
    assert.equal(task.mock.callCount(), 2);
  });

  it("releases the lock even if the task throws", async () => {
    const failing = mock.fn(async () => {
      throw new Error("boom");
    });
    await assert.rejects(() => runSyncOnce(failing), /boom/);
    const ok = mock.fn(async () => {});
    await runSyncOnce(ok);
    assert.equal(ok.mock.callCount(), 1);
  });
});

describe("isTransientError", () => {
  it("returns true for 'Failed to fetch'", () => {
    assert.equal(isTransientError(new Error("Failed to fetch")), true);
  });
  it("returns true for any 5xx in message", () => {
    assert.equal(isTransientError(new Error("503 Service Unavailable")), true);
    assert.equal(isTransientError(new Error("HTTP 502")), true);
  });
  it("returns true for 'network' or 'timeout'", () => {
    assert.equal(isTransientError(new Error("Network request failed")), true);
    assert.equal(isTransientError(new Error("rpc: timeout after 10000ms")), true);
  });
  it("returns false for permanent errors (4xx, RLS)", () => {
    assert.equal(isTransientError(new Error("forbidden: 42501")), false);
    assert.equal(isTransientError(new Error("400 Bad Request")), false);
    assert.equal(isTransientError(new Error("violates row-level security")), false);
  });
  it("returns false for non-Error inputs", () => {
    assert.equal(isTransientError("string"), false);
    assert.equal(isTransientError(null), false);
  });
});
