const MAX_BLOB_BYTES = 50 * 1024; // 50 KB safety cap
const FETCH_TIMEOUT_MS = 3000;

export async function fetchAvatarAsDataUrl(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { cache: "force-cache", signal: controller.signal });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size > MAX_BLOB_BYTES) return null;
    return await blobToDataUrl(blob);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      resolve(typeof result === "string" ? result : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/**
 * Concurrency-limited map over URLs. Resolves with dataURLs (or null on fail) in input order.
 * Used when pre-caching many avatars at once.
 */
export async function fetchAvatarsConcurrent(
  urls: string[],
  concurrency = 4,
): Promise<(string | null)[]> {
  const results: (string | null)[] = new Array(urls.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const i = next++;
      results[i] = await fetchAvatarAsDataUrl(urls[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return results;
}
