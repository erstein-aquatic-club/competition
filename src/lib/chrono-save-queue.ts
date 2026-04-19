import { STORAGE_KEYS } from "./api/client";
import type { ChronoRecordInput, SwimExerciseLogInput } from "./api/types";
import { createChronoRecord } from "./api/chrono-records";
import { createStandaloneSwimLog } from "./api/swim-logs";

export type PendingChronoSave =
  | { kind: "record"; payload: ChronoRecordInput; createdAt: number }
  | { kind: "export"; payload: { authUid: string; log: SwimExerciseLogInput }; createdAt: number };

const QUEUE_KEY = STORAGE_KEYS.CHRONO_SAVE_QUEUE;

// Indirection so tests can inject a fake replayer.
type Replayer = (item: PendingChronoSave) => Promise<void>;

const defaultReplayer: Replayer = async (item) => {
  if (item.kind === "record") {
    await createChronoRecord(item.payload);
  } else {
    await createStandaloneSwimLog(item.payload.authUid, item.payload.log);
  }
};

let replayer: Replayer = defaultReplayer;

export function __setReplayerForTests(r: Replayer): void {
  replayer = r;
}
export function __clearForTests(): void {
  replayer = defaultReplayer;
  listeners.clear();
}

export function isRetriableError(err: unknown): boolean {
  if (err instanceof TypeError) return true; // fetch() threw — network-level
  const msg = (err as { message?: string })?.message ?? "";
  return /NetworkError|Failed to fetch|network/i.test(msg);
}

export function getPending(): PendingChronoSave[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingChronoSave[]) : [];
  } catch {
    localStorage.removeItem(QUEUE_KEY);
    return [];
  }
}

function writePending(items: PendingChronoSave[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    // Quota exceeded — drop oldest and retry once
    console.warn("[chrono-save-queue] quota exceeded, keeping 10 newest");
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-10)));
  }
}

export function enqueue(item: PendingChronoSave): void {
  const current = getPending();
  current.push(item);
  writePending(current);
  notifySubscribers();
}

export async function flush(): Promise<{ succeeded: number; failed: number }> {
  const initial = getPending();
  if (initial.length === 0) return { succeeded: 0, failed: 0 };

  // Clear-before-retry: pop items into a working copy, re-enqueue only retriable failures.
  writePending([]);
  let succeeded = 0;
  let failed = 0;
  const retained: PendingChronoSave[] = [];

  for (const item of initial) {
    try {
      await replayer(item);
      succeeded++;
    } catch (err) {
      failed++;
      if (isRetriableError(err)) {
        retained.push(item);
      } else {
        console.error("[chrono-save-queue] dropping non-retriable item", err);
      }
    }
  }

  // Merge retained with any items enqueued concurrently during replay.
  // Keep retained first (older) then concurrent (newer) so FIFO-ish order is preserved.
  const concurrent = getPending();
  const merged = [...retained, ...concurrent];
  writePending(merged);
  notifySubscribers();
  return { succeeded, failed };
}

// ── Subscribers (pendingCount UI) ────────────────────────────────
const listeners = new Set<() => void>();

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notifySubscribers(): void {
  listeners.forEach((fn) => fn());
}
