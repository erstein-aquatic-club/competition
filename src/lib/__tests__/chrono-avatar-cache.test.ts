import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach, mock } from "node:test";
import { fetchAvatarAsDataUrl } from "../chrono-avatar-cache";

// ── Minimal FileReader stub (Node has no FileReader) ──────────────────────
// Mirrors the slice of the API the production blobToDataUrl uses:
// .onload / .onerror / .result / .readAsDataURL(blob). Resolves on a
// microtask so `await`-ing the consumer promise flushes it naturally.
class FileReaderStub {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL(blob: Blob) {
    void blob
      .arrayBuffer()
      .then((buf) => {
        const base64 = Buffer.from(buf).toString("base64");
        this.result = `data:${blob.type};base64,${base64}`;
        this.onload?.();
      })
      .catch(() => {
        this.onerror?.();
      });
  }
}

describe("fetchAvatarAsDataUrl", () => {
  const originalFetch = globalThis.fetch;
  const originalFileReader = (globalThis as { FileReader?: unknown }).FileReader;

  beforeEach(() => {
    (globalThis as { FileReader?: unknown }).FileReader = FileReaderStub;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    (globalThis as { FileReader?: unknown }).FileReader = originalFileReader;
    mock.timers.reset();
    mock.restoreAll();
  });

  it("returns a base64 data URL on success", async () => {
    const blob = new Blob(["hello"], { type: "image/webp" });
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      blob: async () => blob,
    })) as unknown as typeof fetch;

    const result = await fetchAvatarAsDataUrl("https://example.com/a.webp");
    assert.match(result ?? "", /^data:image\/webp;base64,/);
  });

  it("returns null when fetch rejects", async () => {
    globalThis.fetch = mock.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const result = await fetchAvatarAsDataUrl("https://example.com/x.webp");
    assert.equal(result, null);
  });

  it("returns null when response !ok", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: false,
      blob: async () => new Blob([]),
    })) as unknown as typeof fetch;
    const result = await fetchAvatarAsDataUrl("https://example.com/x.webp");
    assert.equal(result, null);
  });

  it("returns null when blob exceeds 50 KB", async () => {
    const big = new Blob([new Uint8Array(60_000)], { type: "image/webp" });
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      blob: async () => big,
    })) as unknown as typeof fetch;
    const result = await fetchAvatarAsDataUrl("https://example.com/big.webp");
    assert.equal(result, null);
  });

  it("aborts and returns null after 3s timeout", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    globalThis.fetch = mock.fn(
      (_url: unknown, init: RequestInit | undefined) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    ) as unknown as typeof fetch;
    const p = fetchAvatarAsDataUrl("https://example.com/slow.webp");
    mock.timers.tick(3100);
    const result = await p;
    assert.equal(result, null);
  });
});
