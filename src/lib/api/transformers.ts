/**
 * API Transformers - Functions to prepare and transform strength data payloads
 *
 * These functions extract common patterns from api.ts strength methods
 * to reduce duplication and improve maintainability.
 */

import type { StrengthSessionItem, StrengthCycleType } from './types';
import {
  normalizeCycleType,
  normalizeStrengthItem,
  validateStrengthItems,
  estimateOneRm,
} from './client';

// --- Interfaces ---

export interface DbStrengthItemPayload {
  ordre: number;
  exercise_id: number;
  cycle_type: StrengthCycleType | null | undefined;
  sets: number;
  reps: number;
  pct_1rm: number;
  rest_series_s: number;
  notes?: string;
  /** §298 — Cible absolue (cm/s) prescrite par le coach. NULL = libre. */
  target_intensity?: number | null;
}

export interface PreparedStrengthItems {
  cycle: StrengthCycleType;
  normalizedItems: StrengthSessionItem[];
  itemsPayload: DbStrengthItemPayload[];
}

// --- Strength Session Item Transformers ---

/**
 * Prepares and validates strength session items for DB insertion.
 * Used by createStrengthSession and updateStrengthSession.
 */
export const prepareStrengthItemsPayload = (session: {
  cycle?: unknown;
  cycle_type?: unknown;
  items?: unknown[];
}): PreparedStrengthItems => {
  const cycle = normalizeCycleType(session?.cycle ?? session?.cycle_type);
  const rawItems: unknown[] = Array.isArray(session?.items) ? session.items : [];
  const normalizedItems: StrengthSessionItem[] = rawItems.map((item, index) =>
    normalizeStrengthItem(item as Record<string, unknown>, index, cycle),
  );
  validateStrengthItems(normalizedItems);
  const itemsPayload: DbStrengthItemPayload[] = normalizedItems
    .sort((a, b) => a.order_index - b.order_index)
    .map((item) => ({
      ordre: item.order_index,
      exercise_id: item.exercise_id,
      cycle_type: item.cycle_type,
      sets: item.sets,
      reps: item.reps,
      pct_1rm: item.percent_1rm,
      rest_series_s: item.rest_seconds,
      notes: item.notes,
      target_intensity: item.target_intensity ?? null,
    }));
  return { cycle, normalizedItems, itemsPayload };
};

/**
 * Maps prepared items payload to the format needed for DB insert
 * (adds session_id and block fields).
 */
export const mapItemsForDbInsert = (
  itemsPayload: DbStrengthItemPayload[],
  sessionId: number,
  cycle: StrengthCycleType,
) =>
  itemsPayload.map((item) => ({
    session_id: sessionId,
    ordre: item.ordre,
    exercise_id: item.exercise_id,
    block: 'main',
    cycle_type: item.cycle_type ?? cycle,
    sets: item.sets,
    reps: item.reps,
    pct_1rm: item.pct_1rm,
    rest_series_s: item.rest_series_s,
    notes: item.notes,
    target_intensity: item.target_intensity ?? null,
  }));

// --- Strength Run Transformers ---

/**
 * Creates a local strength run object for localStorage fallback.
 * Used by startStrengthRun.
 */
export const createLocalStrengthRun = (
  data: {
    assignment_id?: number | null;
    athlete_id?: number | null;
    athleteName?: string;
    session_id?: number;
    cycle_type?: string;
    progress_pct?: number;
  },
  runId: number,
) => ({
  id: runId,
  assignment_id: data.assignment_id,
  athlete_id: data.athlete_id ?? null,
  athlete_name: data.athleteName ?? null,
  session_id: data.session_id ?? null,
  cycle_type: data.cycle_type ?? null,
  status: 'in_progress' as const,
  progress_pct: data.progress_pct ?? 0,
  started_at: new Date().toISOString(),
  logs: [] as unknown[],
});

/**
 * Creates the DB payload for inserting a strength set log.
 * Used by logStrengthSet.
 */
export const createSetLogDbPayload = (payload: {
  run_id: number;
  exercise_id: number;
  set_index?: number | null;
  reps?: number | null;
  weight?: number | null;
  rpe?: number | null;
  notes?: string | null;
  pct_1rm_suggested?: number | null;
  rest_seconds?: number | null;
  difficulty?: number | null;
}) => ({
  run_id: payload.run_id,
  exercise_id: payload.exercise_id,
  set_index: payload.set_index ?? null,
  reps: payload.reps ?? null,
  weight: payload.weight ?? null,
  pct_1rm_suggested: payload.pct_1rm_suggested ?? null,
  rest_seconds: payload.rest_seconds ?? null,
  rpe: payload.rpe ?? null,
  difficulty: payload.difficulty ?? null,
  notes: payload.notes ?? null,
  completed_at: new Date().toISOString(),
});

/**
 * Maps an array of run logs to DB insert format for bulk insertion.
 * Used by saveStrengthRun.
 */
export const mapLogsForDbInsert = (
  logs: Array<Record<string, unknown>>,
  runId: number,
) =>
  logs.map((log, index) => ({
    run_id: runId,
    exercise_id: log.exercise_id,
    set_index: log.set_index ?? log.set_number ?? index,
    reps: log.reps ?? null,
    weight: log.weight ?? null,
    rpe: log.rpe ?? null,
    difficulty: log.difficulty ?? null,
    notes: log.notes ?? null,
    completed_at: new Date().toISOString(),
  }));

// --- Strength Run Update Transformers ---

/**
 * Builds the DB update payload for a strength run.
 * Used by updateStrengthRun.
 */
export const buildRunUpdatePayload = (update: {
  progress_pct?: number;
  status?: 'in_progress' | 'completed' | 'abandoned';
  fatigue?: number;
  comments?: string;
}): Record<string, unknown> => {
  const payload: Record<string, unknown> = {};
  if (update.progress_pct !== undefined) payload.progress_pct = update.progress_pct;
  if (update.status) payload.status = update.status;
  if (update.status === 'completed') payload.completed_at = new Date().toISOString();
  if (update.fatigue !== undefined) payload.fatigue = update.fatigue;
  if (update.comments !== undefined) payload.comments = update.comments;
  return payload;
};

/**
 * Enriches normalized items with exercise names/categories from a local exercises list.
 * Used by createStrengthSession and updateStrengthSession in localStorage fallback.
 */
export const enrichItemsWithExerciseNames = (
  items: StrengthSessionItem[],
  exercises: Array<{ id: number; nom_exercice?: string; exercise_type?: string }>,
): StrengthSessionItem[] =>
  items.map((item) => {
    const ex = exercises.find((e) => e.id === item.exercise_id);
    return { ...item, exercise_name: ex?.nom_exercice, category: ex?.exercise_type };
  });

// --- 1RM Estimation Helpers ---

/**
 * Collects the best estimated 1RM for each exercise from a set of logs.
 * Used by saveStrengthRun to batch-update 1RM records.
 */
export const collectEstimated1RMs = (
  logs: Array<{ exercise_id?: unknown; weight?: unknown; reps?: unknown }>,
): Map<number, number> => {
  const estimates = new Map<number, number>();
  for (const log of logs) {
    const estimate = estimateOneRm(Number(log.weight), Number(log.reps));
    if (!estimate) continue;
    const exerciseId = Number(log.exercise_id);
    if (!Number.isFinite(exerciseId)) continue;
    const current = estimates.get(exerciseId) ?? 0;
    if (estimate > current) {
      estimates.set(exerciseId, estimate);
    }
  }
  return estimates;
};
