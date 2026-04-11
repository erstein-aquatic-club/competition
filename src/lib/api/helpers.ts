/**
 * API Helpers - Shared mapping functions and internal types
 */

import type { Session, Exercise, Notification, SyncSessionInput } from './types';
import type { LocalStrengthRun } from '../types';
import {
  safeInt,
  safeOptionalInt,
  safeOptionalNumber,
  normalizeScaleToFive,
  expandScaleToTen,
  normalizeExerciseType,
} from './client';

// Re-export SyncSessionInput for convenience
export type { SyncSessionInput };

// --- Internal Interfaces ---

export interface Pagination {
  limit: number;
  offset: number;
  total: number;
}

export interface NotificationListResult {
  notifications: Notification[];
  pagination: Pagination;
}

export interface StrengthExerciseSummary {
  exercise_id: number;
  exercise_name: string;
  total_sets: number;
  total_reps: number;
  total_volume: number;
  max_weight: number | null;
  last_performed_at: string | null;
}

export interface StrengthHistoryResult {
  runs: LocalStrengthRun[];
  pagination: Pagination;
  exercise_summary: StrengthExerciseSummary[];
}

export interface StrengthHistoryAggregateEntry {
  period: string;
  tonnage: number;
  volume: number;
}

export interface StrengthHistoryAggregateResult {
  periods: StrengthHistoryAggregateEntry[];
  pagination: Pagination;
}

// Extended SyncSessionInput with athlete_id for internal use
export type SyncSessionInputWithId = SyncSessionInput & {
  athlete_id?: number | string | null;
};

// --- Exercise Mapping ---

export const normalizeExercise = (exercise: Record<string, unknown>): Exercise => ({
  id: safeInt(exercise.id),
  numero_exercice: safeOptionalInt(exercise.numero_exercice ?? exercise.numero),
  nom_exercice: (exercise.nom_exercice ?? exercise.name ?? '') as string,
  description: (exercise.description ?? null) as string | null,
  illustration_gif: (exercise.illustration_gif ?? null) as string | null,
  exercise_type: normalizeExerciseType(
    exercise.exercise_type ?? exercise.type ?? (exercise.is_warmup ? 'warmup' : 'strength'),
  ),
  warmup_reps: safeOptionalInt(exercise.warmup_reps),
  warmup_duration: safeOptionalInt(exercise.warmup_duration),
  Nb_series_endurance: safeOptionalInt(exercise.Nb_series_endurance),
  Nb_reps_endurance: safeOptionalInt(exercise.Nb_reps_endurance),
  pct_1rm_endurance: safeOptionalNumber(exercise.pct_1rm_endurance),
  recup_endurance: safeOptionalInt(exercise.recup_endurance),
  recup_exercices_endurance: safeOptionalInt(exercise.recup_exercices_endurance),
  Nb_series_hypertrophie: safeOptionalInt(exercise.Nb_series_hypertrophie),
  Nb_reps_hypertrophie: safeOptionalInt(exercise.Nb_reps_hypertrophie),
  pct_1rm_hypertrophie: safeOptionalNumber(exercise.pct_1rm_hypertrophie),
  recup_hypertrophie: safeOptionalInt(exercise.recup_hypertrophie),
  recup_exercices_hypertrophie: safeOptionalInt(exercise.recup_exercices_hypertrophie),
  Nb_series_force: safeOptionalInt(exercise.Nb_series_force),
  Nb_reps_force: safeOptionalInt(exercise.Nb_reps_force),
  pct_1rm_force: safeOptionalNumber(exercise.pct_1rm_force),
  recup_force: safeOptionalInt(exercise.recup_force),
  recup_exercices_force: safeOptionalInt(exercise.recup_exercices_force),
});

// --- Session Mapping ---

export const mapToDbSession = (session: SyncSessionInputWithId): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    athlete_name: session.athlete_name,
    session_date: session.date,
    time_slot: session.slot,
    distance: session.distance,
    duration: session.duration,
    rpe: expandScaleToTen(session.effort),
    performance: expandScaleToTen(session.performance ?? session.feeling),
    engagement: expandScaleToTen(session.engagement ?? session.feeling),
    fatigue: expandScaleToTen(session.feeling),
    comments: session.comments,
  };
  if (
    session.athlete_id !== null &&
    session.athlete_id !== undefined &&
    String(session.athlete_id) !== ''
  ) {
    payload.athlete_id = session.athlete_id;
  }
  if (session.stroke_distances) {
    payload.stroke_distances = session.stroke_distances;
  }
  if (session.assignment_id != null) {
    payload.assignment_id = session.assignment_id;
  }
  return payload;
};

export const mapFromDbSession = (raw: Record<string, unknown>): Session | null => {
  if (!raw) return null;
  const athleteName = String(raw.athlete_name || '').trim();
  const date = String(raw.session_date || raw.date || '').trim();
  if (!athleteName || !date) return null;

  const rpe = normalizeScaleToFive(safeOptionalInt(raw.rpe ?? raw.effort));
  const performance = normalizeScaleToFive(safeOptionalInt(raw.performance ?? raw.feeling));
  const engagement = normalizeScaleToFive(safeOptionalInt(raw.engagement ?? raw.feeling));
  const fatigue = normalizeScaleToFive(safeOptionalInt(raw.fatigue ?? raw.feeling));
  const effort = rpe ?? 3;
  const feeling =
    normalizeScaleToFive(
      safeOptionalInt(raw.fatigue ?? raw.feeling),
    ) ?? 3;

  return {
    id: safeInt(raw.id, Date.now()),
    athlete_id: raw.athlete_id ? safeInt(raw.athlete_id) : undefined,
    athlete_name: athleteName,
    date,
    slot: String(raw.time_slot || raw.slot || ''),
    effort,
    feeling,
    rpe,
    performance,
    engagement,
    fatigue,
    distance: safeInt(raw.distance, 0),
    duration: safeInt(raw.duration, 0),
    comments: (raw.comments || '') as string,
    coach_notes: (raw.coach_notes as string | null) ?? null,
    stroke_distances: (raw.stroke_distances as Session['stroke_distances']) ?? null,
    assignment_id: raw.assignment_id != null ? safeInt(raw.assignment_id) : null,
    created_at: (raw.created_at || raw.updated_at || new Date().toISOString()) as string,
  };
};
