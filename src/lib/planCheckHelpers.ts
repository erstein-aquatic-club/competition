/**
 * Plan session check helpers — localStorage-based weekly tracking.
 *
 * Stores which sessions the swimmer has checked off per ISO week.
 * Auto-resets each Monday (keyed by ISO week string).
 */

function storageKey(userId: number): string {
  return `plan-checks-${userId}`;
}

/** Get ISO week key like "2026-W14" for a given date. */
export function getISOWeekKey(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Set to nearest Thursday: current date + 4 - day number (Mon=1..Sun=7)
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

type CheckStore = Record<string, string[]>;

function readStore(userId: number): CheckStore {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(userId: number, store: CheckStore): void {
  // Keep only last 4 weeks to avoid unbounded growth
  const keys = Object.keys(store).sort().slice(-4);
  const trimmed: CheckStore = {};
  for (const k of keys) trimmed[k] = store[k];
  localStorage.setItem(storageKey(userId), JSON.stringify(trimmed));
}

export function isSessionChecked(userId: number, sessionId: number | string, weekKey?: string): boolean {
  const store = readStore(userId);
  const wk = weekKey ?? getISOWeekKey();
  const ids = store[wk] ?? [];
  return ids.includes(String(sessionId));
}

export function toggleSessionCheck(userId: number, sessionId: number | string, weekKey?: string): boolean {
  const store = readStore(userId);
  const wk = weekKey ?? getISOWeekKey();
  const ids = store[wk] ?? [];
  const sid = String(sessionId);
  const idx = ids.indexOf(sid);
  if (idx >= 0) {
    ids.splice(idx, 1);
  } else {
    ids.push(sid);
  }
  store[wk] = ids;
  writeStore(userId, store);
  return idx < 0; // returns new checked state
}

export function getCheckedSessionIds(userId: number, weekKey?: string): Set<string> {
  const store = readStore(userId);
  const wk = weekKey ?? getISOWeekKey();
  return new Set(store[wk] ?? []);
}
