import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withTimeout } from "@/lib/api/client";

describe("withTimeout", () => {
  it("resolves when promise wins the race", async () => {
    const r = await withTimeout(Promise.resolve(42), 100);
    assert.equal(r, 42);
  });

  it("rejects with the labeled error message when slow", async () => {
    const slow = new Promise<number>((res) => setTimeout(() => res(1), 200));
    await assert.rejects(withTimeout(slow, 50, "test_rpc"), /test_rpc: timeout after 50ms/);
  });

  it("propagates the original rejection when promise rejects fast", async () => {
    const err = new Error("original");
    await assert.rejects(withTimeout(Promise.reject(err), 100), /original/);
  });

  it("uses 'rpc' as default label", async () => {
    const slow = new Promise<number>((res) => setTimeout(() => res(1), 200));
    await assert.rejects(withTimeout(slow, 30), /rpc: timeout/);
  });
});
