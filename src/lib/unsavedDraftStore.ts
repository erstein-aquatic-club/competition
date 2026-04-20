/**
 * unsavedDraftStore — resilience helper for unsaved in-memory UI state.
 *
 * Writes small JSON snapshots to `localStorage` under the namespace
 * `eac_draft:<key>` so that a workout run or feedback draft can be restored
 * after an iOS PWA background-kill or accidental tab close. Kept deliberately
 * minimal: no IndexedDB, no service worker, no external deps.
 *
 * All operations are wrapped in try/catch to tolerate Safari private-mode
 * quota exceptions (QuotaExceededError) and other localStorage failures.
 */

const PREFIX = "eac_draft:";
const SCHEMA_VERSION = 1 as const;

type DraftEnvelope<T> = {
  v: typeof SCHEMA_VERSION;
  savedAt: number;
  payload: T;
};

const hasStorage = (): boolean => {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
};

const fullKey = (key: string) => `${PREFIX}${key}`;

/**
 * Persist a draft snapshot under the given key.
 * Silently swallows storage errors (quota exceeded, private mode, …).
 */
export function saveDraft(key: string, payload: unknown): void {
  if (!hasStorage()) return;
  try {
    const envelope: DraftEnvelope<unknown> = {
      v: SCHEMA_VERSION,
      savedAt: Date.now(),
      payload,
    };
    window.localStorage.setItem(fullKey(key), JSON.stringify(envelope));
  } catch {
    // Swallow: quota exceeded, serialisation cycle, Safari private mode, …
  }
}

/**
 * Load a previously persisted draft. Returns null for missing, corrupted,
 * or schema-mismatched blobs. Never throws.
 */
export function loadDraft<T>(
  key: string,
): { savedAt: number; payload: T } | null {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(fullKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed as DraftEnvelope<unknown>).v !== SCHEMA_VERSION ||
      typeof (parsed as DraftEnvelope<unknown>).savedAt !== "number"
    ) {
      return null;
    }
    const envelope = parsed as DraftEnvelope<T>;
    return { savedAt: envelope.savedAt, payload: envelope.payload };
  } catch {
    return null;
  }
}

/**
 * Remove a persisted draft. Never throws.
 */
export function clearDraft(key: string): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(fullKey(key));
  } catch {
    // Swallow
  }
}

/** Exposed for tests / introspection. */
export const __UNSAFE_INTERNALS__ = { PREFIX, SCHEMA_VERSION };
