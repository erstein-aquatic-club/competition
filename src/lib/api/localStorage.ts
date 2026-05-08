/**
 * Local Storage API - Fallback storage for offline mode
 */

import { STORAGE_KEYS } from './client';
import { assignments_create } from './assignments';

// --- Local Storage Utilities ---

export const localStorageGet = <T = unknown>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const localStorageSave = <T = unknown>(key: string, data: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error('[localStorage] Failed to save:', key, error);
  }
};

// --- Versioned Storage ---

export interface VersionedEntry<T> {
  data: T;
  version: number;
  updatedAt: string;
}

export const localStorageGetVersioned = <T = unknown>(key: string): VersionedEntry<T> | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'version' in parsed) {
      return parsed as VersionedEntry<T>;
    }
    return { data: parsed as T, version: 0, updatedAt: new Date(0).toISOString() };
  } catch { return null; }
};

export const localStorageSaveVersioned = <T = unknown>(key: string, data: T): void => {
  try {
    const existing = localStorageGetVersioned<T>(key);
    const entry: VersionedEntry<T> = {
      data,
      version: (existing?.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    console.error('[localStorage] Failed to save:', key, error);
  }
};

export const localStorageRemove = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore errors
  }
};

export const resetLocalStorageCache = (): void => {
  Object.values(STORAGE_KEYS).forEach(key => localStorageRemove(key));
};

// --- Type-safe storage accessors ---

export const storage = {
  sessions: {
    get: () => localStorageGet<unknown[]>(STORAGE_KEYS.SESSIONS) ?? [],
    save: (data: unknown[]) => localStorageSave(STORAGE_KEYS.SESSIONS, data),
  },
  exercises: {
    get: () => localStorageGet<unknown[]>(STORAGE_KEYS.EXERCISES) ?? [],
    save: (data: unknown[]) => localStorageSave(STORAGE_KEYS.EXERCISES, data),
  },
  strengthSessions: {
    get: () => localStorageGet<unknown[]>(STORAGE_KEYS.STRENGTH_SESSIONS) ?? [],
    save: (data: unknown[]) => localStorageSave(STORAGE_KEYS.STRENGTH_SESSIONS, data),
  },
  swimSessions: {
    get: () => localStorageGet<unknown[]>(STORAGE_KEYS.SWIM_SESSIONS) ?? [],
    save: (data: unknown[]) => localStorageSave(STORAGE_KEYS.SWIM_SESSIONS, data),
  },
  assignments: {
    get: () => localStorageGet<unknown[]>(STORAGE_KEYS.ASSIGNMENTS) ?? [],
    save: (data: unknown[]) => localStorageSave(STORAGE_KEYS.ASSIGNMENTS, data),
  },
  strengthRuns: {
    get: () => localStorageGet<unknown[]>(STORAGE_KEYS.STRENGTH_RUNS) ?? [],
    save: (data: unknown[]) => localStorageSave(STORAGE_KEYS.STRENGTH_RUNS, data),
  },
  notifications: {
    get: () => localStorageGet<unknown[]>(STORAGE_KEYS.NOTIFICATIONS) ?? [],
    save: (data: unknown[]) => localStorageSave(STORAGE_KEYS.NOTIFICATIONS, data),
  },
  oneRm: {
    get: () => localStorageGet<unknown[]>(STORAGE_KEYS.ONE_RM) ?? [],
    save: (data: unknown[]) => localStorageSave(STORAGE_KEYS.ONE_RM, data),
  },
  swimRecords: {
    get: () => localStorageGet<unknown[]>(STORAGE_KEYS.SWIM_RECORDS) ?? [],
    save: (data: unknown[]) => localStorageSave(STORAGE_KEYS.SWIM_RECORDS, data),
  },
  timesheetShifts: {
    get: () => localStorageGet<unknown[]>(STORAGE_KEYS.TIMESHEET_SHIFTS) ?? [],
    save: (data: unknown[]) => localStorageSave(STORAGE_KEYS.TIMESHEET_SHIFTS, data),
  },
  timesheetLocations: {
    get: () => localStorageGet<unknown[]>(STORAGE_KEYS.TIMESHEET_LOCATIONS) ?? [],
    save: (data: unknown[]) => localStorageSave(STORAGE_KEYS.TIMESHEET_LOCATIONS, data),
  },
};

/**
 * §219 — Migré depuis api.ts:644-679. Initialise le localStorage avec
 * des données de démo (4 exercices, 1 séance strength, 1 séance swim,
 * 1 assignment). Helper dev/onboarding offline.
 */
export async function seedDemoData() {
  const exercises = [
    { id: 1, nom_exercice: "Squat", description: "Flexion des jambes", exercise_type: "strength" },
    { id: 2, nom_exercice: "Développé Couché", description: "Poussée horizontale", exercise_type: "strength" },
    { id: 3, nom_exercice: "Tractions", description: "Tirage vertical", exercise_type: "strength" },
    { id: 4, nom_exercice: "Rotations Élastique", description: "Coiffe des rotateurs", exercise_type: "warmup" },
  ];
  localStorageSave(STORAGE_KEYS.EXERCISES, exercises);

  const sSession = {
    id: 101, title: "Full Body A", description: "Séance globale", cycle: "Endurance",
    items: [
      { exercise_id: 4, exercise_name: "Rotations Élastique", category: "warmup", order_index: 0, sets: 2, reps: 15, rest_seconds: 30, percent_1rm: 0 },
      { exercise_id: 1, exercise_name: "Squat", category: "strength", order_index: 1, sets: 4, reps: 10, rest_seconds: 90, percent_1rm: 70 },
      { exercise_id: 2, exercise_name: "Développé Couché", category: "strength", order_index: 2, sets: 4, reps: 10, rest_seconds: 90, percent_1rm: 70 },
    ],
  };
  localStorageSave(STORAGE_KEYS.STRENGTH_SESSIONS, [sSession]);

  const swSession = {
    id: 201,
    name: "VMA 100",
    description: "Travail de vitesse",
    created_by: 1,
    items: [
      { label: "Échauffement 4N", distance: 400, intensity: "Souple", notes: "Progressif" },
      { label: "Corps NL", distance: 1000, intensity: "Max", notes: "10x100 départ 1:30" },
    ],
  };
  localStorageSave(STORAGE_KEYS.SWIM_SESSIONS, [swSession]);

  const today = new Date().toISOString().split("T")[0];
  await assignments_create({ session_id: 101, assignment_type: "strength", target_athlete: "Camille", assigned_date: today });

  return { status: "seeded" };
}

/**
 * §219 — Migré depuis api.ts:691-694. Vide le localStorage et reload
 * la page. Helper dev-tools.
 */
export function resetCache() {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  window.location.reload();
}
