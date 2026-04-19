import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchAvatarAsDataUrl } from "../chrono-avatar-cache";

describe("fetchAvatarAsDataUrl", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("returns a base64 data URL on success", async () => {
    const blob = new Blob(["hello"], { type: "image/webp" });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => blob,
    } as unknown as Response);

    const p = fetchAvatarAsDataUrl("https://example.com/a.webp");
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result).toMatch(/^data:image\/webp;base64,/);
  });

  it("returns null when fetch rejects", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await fetchAvatarAsDataUrl("https://example.com/x.webp");
    expect(result).toBeNull();
  });

  it("returns null when response !ok", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      blob: async () => new Blob([]),
    } as unknown as Response);
    const result = await fetchAvatarAsDataUrl("https://example.com/x.webp");
    expect(result).toBeNull();
  });

  it("returns null when blob exceeds 50 KB", async () => {
    const big = new Blob([new Uint8Array(60_000)], { type: "image/webp" });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => big,
    } as unknown as Response);
    const result = await fetchAvatarAsDataUrl("https://example.com/big.webp");
    expect(result).toBeNull();
  });

  it("aborts and returns null after 3s timeout", async () => {
    globalThis.fetch = vi.fn().mockImplementation(
      (_url, init: RequestInit | undefined) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const p = fetchAvatarAsDataUrl("https://example.com/slow.webp");
    await vi.advanceTimersByTimeAsync(3100);
    const result = await p;
    expect(result).toBeNull();
  });
});
