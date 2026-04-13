const QUEUE_KEY = "eac-offline-queue";

/** After 7 days, a queued mutation is considered stale and dropped at read time. */
const QUEUE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** A mutation that fails this many consecutive times is moved to "poisoned" and dropped. */
export const MAX_RETRY_ATTEMPTS = 5;

export type QueuedMutation = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
  /** Number of failed replay attempts. Defaults to 0 for items created before this field. */
  retryCount?: number;
  /** Epoch ms of the last replay attempt, useful for debugging. */
  lastAttemptAt?: number;
};

export function enqueue(type: string, payload: Record<string, unknown>) {
  const queue = getQueue();
  queue.push({
    id: crypto.randomUUID(),
    type,
    payload,
    timestamp: Date.now(),
    retryCount: 0,
  });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Returns the queue, reaping stale (> TTL) or poisoned (retry >= MAX) items
 * in the same pass. Stale/poisoned items are silently dropped from storage.
 */
export function getQueue(): QueuedMutation[] {
  let raw: QueuedMutation[];
  try {
    raw = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  const now = Date.now();
  const alive: QueuedMutation[] = [];
  let reaped = 0;
  for (const item of raw) {
    const age = now - (item.timestamp ?? now);
    const retries = item.retryCount ?? 0;
    if (age > QUEUE_TTL_MS || retries >= MAX_RETRY_ATTEMPTS) {
      reaped += 1;
      continue;
    }
    alive.push(item);
  }
  if (reaped > 0) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(alive));
    console.warn(`[offline-queue] Reaped ${reaped} stale/poisoned mutation(s)`);
  }
  return alive;
}

export function getQueueSize(): number {
  return getQueue().length;
}

export function saveQueue(queue: QueuedMutation[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function clearQueue() {
  localStorage.removeItem(QUEUE_KEY);
}

export function removeQueueItem(id: string) {
  const queue = getQueue().filter((item) => item.id !== id);
  saveQueue(queue);
}

/**
 * Increment the retry counter for a failed mutation and persist. If the
 * counter reaches MAX_RETRY_ATTEMPTS the item is dropped (poisoned).
 * Returns true if the item was dropped, false if it remains in the queue.
 */
export function markRetry(id: string): boolean {
  const queue = getQueue();
  const idx = queue.findIndex((item) => item.id === id);
  if (idx === -1) return false;
  const item = queue[idx];
  const nextRetry = (item.retryCount ?? 0) + 1;
  if (nextRetry >= MAX_RETRY_ATTEMPTS) {
    queue.splice(idx, 1);
    saveQueue(queue);
    console.error(
      `[offline-queue] Dropping poisoned mutation id=${id} type=${item.type} after ${nextRetry} attempts`,
    );
    return true;
  }
  queue[idx] = { ...item, retryCount: nextRetry, lastAttemptAt: Date.now() };
  saveQueue(queue);
  return false;
}

export function dequeue(): QueuedMutation | undefined {
  const queue = getQueue();
  const item = queue.shift();
  saveQueue(queue);
  return item;
}
