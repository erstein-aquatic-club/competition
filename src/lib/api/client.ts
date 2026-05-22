/**
 * API Client utilities and shared helpers
 */

import { supabaseConfig } from "../config";
import { supabase } from "../supabase";
import { normalizeIntensityMetric } from "@/lib/strength/intensityMetrics";
import type {
  Exercise,
  StrengthSessionItem,
  StrengthCycleType,
  ApiErrorInfo
} from "./types";

// --- Network and Supabase availability ---

export const isNetworkAvailable = () => {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
};

export const canUseSupabase = () => supabaseConfig.hasSupabase && isNetworkAvailable();

// Re-export supabase client for modules
export { supabase };

// --- Bodyweight sentinel ---

/** Sentinel value stored in weight column to indicate bodyweight exercise (no external load). */
export const BODYWEIGHT_SENTINEL = -1;
/** Returns true when the weight value represents a bodyweight set. */
export const isBodyweight = (w: number | null | undefined): boolean => w === BODYWEIGHT_SENTINEL;

// --- Storage keys for local mock ---

export const STORAGE_KEYS = {
  SESSIONS: "suivi_natation_sessions",
  EXERCISES: "suivi_natation_exercises",
  STRENGTH_SESSIONS: "suivi_natation_strength_sessions",
  SWIM_SESSIONS: "suivi_natation_swim_sessions",
  ASSIGNMENTS: "suivi_natation_assignments",
  STRENGTH_RUNS: "suivi_natation_strength_runs",
  NOTIFICATIONS: "suivi_natation_notifications",
  ONE_RM: "suivi_natation_1rm",
  SWIM_RECORDS: "suivi_natation_swim_records",
  TIMESHEET_SHIFTS: "suivi_natation_timesheet_shifts",
  TIMESHEET_LOCATIONS: "suivi_natation_timesheet_locations",
  CHRONO_BACKUP: "eac-chrono-backup",
  CHRONO_SAVE_QUEUE: "eac-chrono-save-queue",
} as const;

// --- Safe type conversions ---

export const safeInt = (value: unknown, fallback = 0): number => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : fallback;
};

export const safeOptionalInt = (value: unknown): number | null => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : null;
};

export const safeOptionalNumber = (value: unknown): number | null => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

// --- Scale normalization (5 ↔ 10 scale) ---

export const normalizeScaleToFive = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.min(5, Math.max(1, Math.round(num / 2)));
};

export const expandScaleToTen = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num <= 5) return Math.round(num * 2);
  return Math.round(num);
};

// --- 1RM estimation ---

// Epley formula: 1RM = weight × (1 + reps / 30)
// Cached in one_rm_records.weight; changing the formula would invalidate
// all historical estimates, so it's intentionally fixed.
export const estimateOneRm = (weight?: number | null, reps?: number | null): number | null => {
  if (!Number.isFinite(weight) || !Number.isFinite(reps)) return null;
  if ((weight ?? 0) <= 0 || (reps ?? 0) <= 0) return null;
  if ((reps as number) > 30) return null; // unrealistic rep count — skip estimation
  if (reps === 1) return Math.round(weight as number);
  return Math.round((weight as number) * (1 + (reps as number) / 30));
};

// --- Error handling ---

const loggedErrors = new Set<string>();

export const parseApiError = (error: unknown): ApiErrorInfo => {
  if (error instanceof Error) {
    const info = error as ApiErrorInfo & Error;
    return {
      message: info.message || "Erreur inconnue",
      code: info.code,
      status: info.status,
    };
  }
  return { message: String(error || "Erreur inconnue") };
};

export const summarizeApiError = (error: unknown, fallbackMessage: string): ApiErrorInfo => {
  const info = parseApiError(error);
  const status = info.status;
  const code = info.code;
  let message = info.message || fallbackMessage;
  if (code === "unknown_action") {
    message = "Action inconnue côté serveur.";
  } else if (code === "table_missing") {
    message = "Base de données non initialisée (table manquante).";
  } else if (status === 401) {
    message = "Authentification expirée ou manquante.";
  } else if (status === 403) {
    message = "Accès refusé pour ce rôle.";
  }
  const logKey = `${code ?? "none"}:${status ?? "none"}:${message}`;
  if (!loggedErrors.has(logKey)) {
    console.error("[api] error:", info);
    loggedErrors.add(logKey);
  }
  return { ...info, message };
};

/**
 * §232 — Centralise le pattern `if (error) throw new Error(error.message)`
 * (~239 occurrences dans src/lib/api/). Comportement byte-identical aux
 * call-sites avant migration.
 *
 * Compatible avec `PostgrestResponse<T>` (data: T[] | null) ET
 * `PostgrestSingleResponse<T>` (data: T | null) — la TS inference flow
 * naturellement.
 *
 * Usage :
 *   const data = assertSupabase(await supabase.from("foo").select("*"));
 *   assertSupabase(await supabase.from("foo").delete().eq("id", id));
 *   return assertSupabase(await supabase.rpc("my_rpc", { … }));
 *
 * NE PAS utiliser pour : conditional throws (`error.code !== '23505'`),
 * messages d'erreur enrichis (prefix), gestion gracieuse (`return null`).
 */
export function assertSupabase<T>(
  res: { data: T; error: { message: string } | null },
): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

// --- Cycle type normalization ---

export const normalizeCycleType = (value: unknown): StrengthCycleType => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "hypertrophie" || normalized === "force" || normalized === "endurance") {
    return normalized;
  }
  return "endurance";
};

// --- Exercise type normalization ---

export const isExerciseType = (value: unknown): value is Exercise["exercise_type"] =>
  value === "strength" || value === "warmup";

export const normalizeExerciseType = (value: unknown): Exercise["exercise_type"] =>
  isExerciseType(value) ? value : "strength";

// --- Strength item normalization ---

export const normalizeStrengthItem = (
  item: Record<string, unknown>,
  index: number,
  sessionCycle: string,
): StrengthSessionItem => ({
  exercise_id: safeInt(item.exercise_id),
  order_index: safeOptionalInt(item.ordre ?? item.order_index) ?? index,
  sets: safeOptionalInt(item.sets) ?? 0,
  reps: safeOptionalInt(item.reps) ?? 0,
  rest_seconds: safeOptionalInt(item.rest_series_s ?? item.rest_seconds) ?? 0,
  percent_1rm: safeOptionalInt(item.pct_1rm ?? item.percent_1rm) ?? 0,
  cycle_type: normalizeCycleType(item.cycle_type ?? sessionCycle),
  notes: (item.notes as string) ?? "",
  exercise_name: (item.exercise_name ?? item.nom_exercice) as string | undefined,
  category: (item.category ?? item.exercise_type) as string | undefined,
  // §296 — propage le block ('warmup' / 'main') du DB pour distinction visuelle
  block:
    item.block === "warmup" || item.block === "main"
      ? (item.block as "warmup" | "main")
      : null,
});

export const validateStrengthItems = (items: StrengthSessionItem[]): void => {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!Number.isFinite(item.sets) || item.sets < 0) {
      throw new Error(`Séries invalides pour l'exercice #${index + 1}`);
    }
    if (!Number.isFinite(item.reps) || item.reps < 0) {
      throw new Error(`Reps invalides pour l'exercice #${index + 1}`);
    }
    if (!Number.isFinite(item.rest_seconds) || item.rest_seconds < 0) {
      throw new Error(`Repos invalide pour l'exercice #${index + 1}`);
    }
  }
};

// --- Exercise mapping (DB ↔ API) ---

export const mapDbExerciseToApi = (row: Record<string, unknown>): Exercise => ({
  id: safeInt(row.id),
  numero_exercice: safeOptionalInt(row.numero_exercice),
  nom_exercice: (row.nom_exercice as string) ?? "",
  description: (row.description as string) ?? null,
  illustration_gif: (row.illustration_gif as string) ?? null,
  exercise_type: normalizeExerciseType(row.exercise_type),
  warmup_reps: null,
  warmup_duration: null,
  Nb_series_endurance: safeOptionalInt(row.nb_series_endurance),
  Nb_reps_endurance: safeOptionalInt(row.nb_reps_endurance),
  pct_1rm_endurance: safeOptionalNumber(row.pourcentage_charge_1rm_endurance),
  recup_endurance: safeOptionalInt(row.recup_series_endurance),
  recup_exercices_endurance: safeOptionalInt(row.recup_exercices_endurance),
  Nb_series_hypertrophie: safeOptionalInt(row.nb_series_hypertrophie),
  Nb_reps_hypertrophie: safeOptionalInt(row.nb_reps_hypertrophie),
  pct_1rm_hypertrophie: safeOptionalNumber(row.pourcentage_charge_1rm_hypertrophie),
  recup_hypertrophie: safeOptionalInt(row.recup_series_hypertrophie),
  recup_exercices_hypertrophie: safeOptionalInt(row.recup_exercices_hypertrophie),
  Nb_series_force: safeOptionalInt(row.nb_series_force),
  Nb_reps_force: safeOptionalInt(row.nb_reps_force),
  pct_1rm_force: safeOptionalNumber(row.pourcentage_charge_1rm_force),
  recup_force: safeOptionalInt(row.recup_series_force),
  recup_exercices_force: safeOptionalInt(row.recup_exercices_force),
  folder_id: safeOptionalInt(row.folder_id),
  is_bodyweight: row.is_bodyweight === true,
  intensity_metric: normalizeIntensityMetric(row.intensity_metric),
});

export const mapApiExerciseToDb = (exercise: Partial<Exercise>) => ({
  numero_exercice: exercise.numero_exercice ?? null,
  nom_exercice: exercise.nom_exercice ?? (exercise as Record<string, unknown>).name ?? "",
  description: exercise.description ?? null,
  illustration_gif: exercise.illustration_gif ?? null,
  exercise_type: exercise.exercise_type ?? "strength",
  nb_series_endurance: exercise.Nb_series_endurance ?? null,
  nb_reps_endurance: exercise.Nb_reps_endurance ?? null,
  pourcentage_charge_1rm_endurance: exercise.pct_1rm_endurance ?? null,
  recup_series_endurance: exercise.recup_endurance ?? null,
  recup_exercices_endurance: exercise.recup_exercices_endurance ?? null,
  nb_series_hypertrophie: exercise.Nb_series_hypertrophie ?? null,
  nb_reps_hypertrophie: exercise.Nb_reps_hypertrophie ?? null,
  pourcentage_charge_1rm_hypertrophie: exercise.pct_1rm_hypertrophie ?? null,
  recup_series_hypertrophie: exercise.recup_hypertrophie ?? null,
  recup_exercices_hypertrophie: exercise.recup_exercices_hypertrophie ?? null,
  nb_series_force: exercise.Nb_series_force ?? null,
  nb_reps_force: exercise.Nb_reps_force ?? null,
  pourcentage_charge_1rm_force: exercise.pct_1rm_force ?? null,
  recup_series_force: exercise.recup_force ?? null,
  recup_exercices_force: exercise.recup_exercices_force ?? null,
  folder_id: exercise.folder_id ?? null,
  is_bodyweight: exercise.is_bodyweight === true,
  intensity_metric: normalizeIntensityMetric(exercise.intensity_metric),
});

// --- Misc utilities ---

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const parseRawPayload = (raw: unknown): Record<string, unknown> | null => {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as Record<string, unknown>;
  return null;
};

export const fetchUserGroupIds = async (userId?: number | null): Promise<number[]> => {
  if (!userId || !canUseSupabase()) return [];
  const { data, error } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", userId);
  if (error || !data) return [];
  return data.map((m: { group_id: number }) => m.group_id).filter((id: number) => id > 0);
};

// --- Temporary-group aware group ID helpers ---

type GroupMemberRow = {
  group_id: number;
  groups: { is_temporary: boolean; is_active: boolean; parent_group_id: number | null };
};

type GroupIdPartition = {
  permanentGroupIds: number[];
  temporaryGroupIds: number[];
  hasActiveTemporary: boolean;
};

export const partitionGroupIds = (rows: GroupMemberRow[]): GroupIdPartition => {
  const permanentGroupIds: number[] = [];
  const temporarySet = new Set<number>();
  let hasActiveTemporary = false;

  for (const row of rows) {
    const g = row.groups;
    if (g.is_temporary) {
      if (g.is_active) {
        hasActiveTemporary = true;
        temporarySet.add(row.group_id);
        if (g.parent_group_id) {
          temporarySet.add(g.parent_group_id);
        }
      }
    } else {
      permanentGroupIds.push(row.group_id);
    }
  }

  return { permanentGroupIds, temporaryGroupIds: Array.from(temporarySet), hasActiveTemporary };
};

export const fetchUserGroupIdsWithContext = async (
  userId?: number | null,
): Promise<GroupIdPartition> => {
  const empty: GroupIdPartition = { permanentGroupIds: [], temporaryGroupIds: [], hasActiveTemporary: false };
  if (!userId || !canUseSupabase()) return empty;

  const { data, error } = await supabase
    .from("group_members")
    .select("group_id, groups!inner(is_temporary, is_active, parent_group_id)")
    .eq("user_id", userId);

  if (error || !data) return empty;
  return partitionGroupIds(data as unknown as GroupMemberRow[]);
};

// --- Promise timeout helper ---

/**
 * Race a promise (or thenable) against a timeout. On expiration, rejects with
 * a typed error containing the label so callers (and `isTransientError`) can
 * recognize it.
 *
 * §260 — Accepts `PromiseLike<T>` (not just `Promise<T>`) so callers can pass
 * Supabase query builders / RPC builders directly without a `Promise.resolve()`
 * wrap. Runtime is unchanged: `Promise.race` already accepts thenables.
 */
export async function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  label = "rpc",
): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label}: timeout after ${ms}ms`)),
        ms,
      ),
    ),
  ]);
}
