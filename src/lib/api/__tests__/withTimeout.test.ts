import { describe, it, expect } from "vitest";
import { withTimeout } from "@/lib/api/client";

describe("withTimeout", () => {
  it("resolves when promise wins the race", async () => {
    const r = await withTimeout(Promise.resolve(42), 100);
    expect(r).toBe(42);
  });

  it("rejects with the labeled error message when slow", async () => {
    const slow = new Promise<number>((res) => setTimeout(() => res(1), 200));
    await expect(withTimeout(slow, 50, "test_rpc")).rejects.toThrow(/test_rpc: timeout after 50ms/);
  });

  it("propagates the original rejection when promise rejects fast", async () => {
    const err = new Error("original");
    await expect(withTimeout(Promise.reject(err), 100)).rejects.toThrow("original");
  });

  it("uses 'rpc' as default label", async () => {
    const slow = new Promise<number>((res) => setTimeout(() => res(1), 200));
    await expect(withTimeout(slow, 30)).rejects.toThrow(/rpc: timeout/);
  });
});
