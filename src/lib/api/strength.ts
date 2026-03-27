/**
 * API Strength - Strength training methods
 */

import {
  supabase,
  canUseSupabase,
  safeInt,
  safeOptionalInt,
  safeOptionalNumber,
  normalizeCycleType,
  normalizeStrengthItem,
  mapDbExerciseToApi,
  mapApiExerciseToDb,
  normalizeExerciseType,
  estimateOneRm,
  STORAGE_KEYS,
  BODYWEIGHT_SENTINEL,
  isBodyweight,
} from './client';
import type {
  Exercise,
  StrengthSessionTemplate,
  StrengthSessionItem,
  StrengthCycleType,
  StrengthFolder,
} from './types';
import { normalizeExercise } from './helpers';
import type {
  StrengthExerciseSummary,
  StrengthHistoryResult,
  StrengthHistoryAggregateEntry,
  StrengthHistoryAggregateResult,
} from './helpers';
import {
  prepareStrengthItemsPayload,
  mapItemsForDbInsert,
  createLocalStrengthRun,
  createSetLogDbPayload,
  buildRunUpdatePayload,
  collectEstimated1RMs,
  enrichItemsWithExerciseNames,
  mapLogsForDbInsert,
} from './transformers';
import { localStorageGet, localStorageSave } from './localStorage';

// --- Exercises ---

export async function getExercises(): Promise<Exercise[]> {
  if (canUseSupabase()) {
    const { data, error } = await supabase.from("dim_exercices").select("*");
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapDbExerciseToApi);
  }
  const exercises = (localStorageGet(STORAGE_KEYS.EXERCISES) || []) as any[];
  const list = Array.isArray(exercises) ? exercises : [];
  return list.map((exercise: any) => normalizeExercise(exercise));
}

export async function createExercise(exercise: Omit<Exercise, "id">) {
  const exercise_type = normalizeExerciseType(exercise.exercise_type);

  if (canUseSupabase()) {
    const dbRow = mapApiExerciseToDb({ ...exercise, exercise_type });
    const { error } = await supabase.from("dim_exercices").insert(dbRow);
    if (error) throw new Error(error.message);
    return { status: "created" };
  }

  const ex = (localStorageGet(STORAGE_KEYS.EXERCISES) || []) as any[];
  const nextExercise = normalizeExercise({
    ...exercise,
    exercise_type,
    id: Date.now(),
  });
  localStorageSave(STORAGE_KEYS.EXERCISES, [...ex, nextExercise]);
  return { status: "created" };
}

export async function updateExercise(exercise: Exercise) {
  const exercise_type = normalizeExerciseType(exercise.exercise_type);

  if (canUseSupabase()) {
    const dbRow = mapApiExerciseToDb({ ...exercise, exercise_type });
    const { error } = await supabase
      .from("dim_exercices")
      .update(dbRow)
      .eq("id", exercise.id);
    if (error) throw new Error(error.message);
    return { status: "updated" };
  }

  const exercises = (localStorageGet(STORAGE_KEYS.EXERCISES) || []) as any[];
  const index = exercises.findIndex((item: Exercise) => item.id === exercise.id);
  if (index === -1) {
    throw new Error("Exercice introuvable");
  }
  const updatedExercise = normalizeExercise({
    ...exercises[index],
    ...exercise,
    exercise_type,
  });
  const updatedList = [...exercises];
  updatedList[index] = updatedExercise;
  localStorageSave(STORAGE_KEYS.EXERCISES, updatedList);
  return { status: "updated" };
}

export async function deleteExercise(exerciseId: number) {
  if (canUseSupabase()) {
    const { error } = await supabase
      .from("dim_exercices")
      .delete()
      .eq("id", exerciseId);
    if (error) throw new Error(error.message);
    return { status: "deleted" };
  }

  const exercises = (localStorageGet(STORAGE_KEYS.EXERCISES) || []) as any[];
  const updatedExercises = exercises.filter(
    (exercise: Exercise) => exercise.id !== exerciseId,
  );
  localStorageSave(STORAGE_KEYS.EXERCISES, updatedExercises);
  const sessions = (localStorageGet(STORAGE_KEYS.STRENGTH_SESSIONS) || []) as any[];
  const updatedSessions = sessions.map((session: StrengthSessionTemplate) => ({
    ...session,
    items: Array.isArray(session.items)
      ? session.items.filter(
          (item: StrengthSessionItem) => item.exercise_id !== exerciseId,
        )
      : session.items,
  }));
  localStorageSave(STORAGE_KEYS.STRENGTH_SESSIONS, updatedSessions);
  return { status: "deleted" };
}

// --- Strength Sessions ---

export async function getStrengthSessions(): Promise<StrengthSessionTemplate[]> {
  if (canUseSupabase()) {
    const { data: sessions, error } = await supabase
      .from("strength_sessions")
      .select(
        "*, strength_session_items(*, dim_exercices(nom_exercice, exercise_type))",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (sessions ?? []).map((session: any) => {
      const rawItems = Array.isArray(session.strength_session_items)
        ? session.strength_session_items
        : [];
      const cycle = normalizeCycleType(rawItems[0]?.cycle_type);
      return {
        id: safeInt(session.id, Date.now()),
        title: String(session.name || ""),
        description: session.description ?? "",
        cycle,
        folder_id: safeOptionalInt(session.folder_id),
        items: rawItems
          .sort((a: any, b: any) => (a.ordre ?? 0) - (b.ordre ?? 0))
          .map((item: any, index: number) => ({
            ...normalizeStrengthItem(item, index, cycle),
            exercise_name: item.dim_exercices?.nom_exercice ?? undefined,
            category: item.dim_exercices?.exercise_type ?? undefined,
          })),
      };
    });
  }
  return (localStorageGet(STORAGE_KEYS.STRENGTH_SESSIONS) || []) as StrengthSessionTemplate[];
}

export async function createStrengthSession(session: any) {
  const { cycle, normalizedItems, itemsPayload } =
    prepareStrengthItemsPayload(session);

  if (canUseSupabase()) {
    const { data: created, error } = await supabase
      .from("strength_sessions")
      .insert({
        name: session?.title ?? session?.name ?? "",
        description: session?.description ?? "",
        folder_id: session?.folder_id ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const sessionId = created.id;
    if (itemsPayload.length > 0) {
      const { error: itemsError } = await supabase
        .from("strength_session_items")
        .insert(mapItemsForDbInsert(itemsPayload, sessionId, cycle));
      if (itemsError) throw new Error(itemsError.message);
    }
    return { status: "created", id: sessionId };
  }

  const s = (localStorageGet(STORAGE_KEYS.STRENGTH_SESSIONS) || []) as any[];
  const id = Date.now();
  const enrichedItems = enrichItemsWithExerciseNames(
    normalizedItems,
    (localStorageGet(STORAGE_KEYS.EXERCISES) || []) as any[],
  );
  localStorageSave(STORAGE_KEYS.STRENGTH_SESSIONS, [
    ...s,
    {
      ...session,
      title: session?.title ?? session?.name ?? "",
      cycle,
      items: enrichedItems,
      id,
    },
  ]);
  return { status: "created", id };
}

export async function updateStrengthSession(session: any) {
  if (!session?.id) {
    throw new Error("Session id manquant");
  }
  const { cycle, normalizedItems, itemsPayload } =
    prepareStrengthItemsPayload(session);

  if (canUseSupabase()) {
    const rpcItems = mapItemsForDbInsert(itemsPayload, session.id, cycle).map(
      ({ session_id: _sid, ...item }) => ({
        ordre: item.ordre,
        exercise_id: item.exercise_id,
        block: item.block ?? 'main',
        cycle_type: item.cycle_type ?? 'normal',
        sets: item.sets ?? null,
        reps: item.reps ?? null,
        pct_1rm: item.pct_1rm ?? null,
        rest_series_s: item.rest_series_s ?? null,
        rest_exercise_s: null as number | null,
        notes: item.notes ?? null,
        raw_payload: null as unknown,
      }),
    );
    const { error } = await supabase.rpc('update_strength_session_atomic', {
      p_session_id: session.id,
      p_name: session?.title ?? session?.name ?? '',
      p_description: session?.description ?? '',
      p_folder_id: session?.folder_id ?? null,
      p_items: rpcItems,
    });
    if (error) throw new Error(error.message);
    return { status: "updated" };
  }

  const sessions = (localStorageGet(STORAGE_KEYS.STRENGTH_SESSIONS) || []) as any[];
  const index = sessions.findIndex(
    (item: StrengthSessionTemplate) => item.id === session.id,
  );
  if (index === -1) {
    throw new Error("Séance introuvable");
  }
  const enrichedItems = enrichItemsWithExerciseNames(
    normalizedItems,
    (localStorageGet(STORAGE_KEYS.EXERCISES) || []) as any[],
  );
  const updatedSession = {
    ...sessions[index],
    ...session,
    title: session?.title ?? session?.name ?? "",
    cycle,
    items: enrichedItems,
  };
  const updatedSessions = [...sessions];
  updatedSessions[index] = updatedSession;
  localStorageSave(STORAGE_KEYS.STRENGTH_SESSIONS, updatedSessions);
  return { status: "updated" };
}

export async function persistStrengthSessionOrder(
  session: StrengthSessionTemplate,
) {
  return updateStrengthSession(session);
}

export async function deleteStrengthSession(sessionId: number) {
  if (canUseSupabase()) {
    const { error } = await supabase
      .from("strength_sessions")
      .delete()
      .eq("id", sessionId);
    if (error) throw new Error(error.message);
    return { status: "deleted" };
  }

  const sessions = (localStorageGet(STORAGE_KEYS.STRENGTH_SESSIONS) || []) as any[];
  const updatedSessions = sessions.filter(
    (session: StrengthSessionTemplate) => session.id !== sessionId,
  );
  localStorageSave(STORAGE_KEYS.STRENGTH_SESSIONS, updatedSessions);
  return { status: "deleted" };
}

// --- Strength Runs ---

export async function startStrengthRun(data: {
  assignment_id?: number | null;
  athlete_id?: number | null;
  athleteName?: string;
  session_id?: number;
  cycle_type?: string;
  progress_pct?: number;
}) {
  if (canUseSupabase()) {
    const { data: run, error } = await supabase
      .from("strength_session_runs")
      .insert({
        assignment_id: data.assignment_id ?? null,
        athlete_id: data.athlete_id ?? null,
        session_id: data.session_id ?? null,
        status: "in_progress",
        progress_pct: data.progress_pct ?? 0,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (data.assignment_id) {
      await supabase
        .from("session_assignments")
        .update({ status: "in_progress" })
        .eq("id", data.assignment_id);
    }
    return { run_id: run.id };
  }
  const runs = (localStorageGet(STORAGE_KEYS.STRENGTH_RUNS) || []) as any[];
  const run_id = Date.now();
  const newRun = createLocalStrengthRun(data, run_id);
  localStorageSave(STORAGE_KEYS.STRENGTH_RUNS, [...runs, newRun]);
  if (data.assignment_id) {
    const assignments = (localStorageGet(STORAGE_KEYS.ASSIGNMENTS) || []) as any[];
    const updated = assignments.map((assignment: any) =>
      assignment.id === data.assignment_id
        ? { ...assignment, status: "in_progress" }
        : assignment,
    );
    localStorageSave(STORAGE_KEYS.ASSIGNMENTS, updated);
  }
  return { run_id };
}

export async function logStrengthSet(payload: {
  run_id: number;
  exercise_id: number;
  set_index?: number | null;
  reps?: number | null;
  weight?: number | null;
  rpe?: number | null;
  notes?: string | null;
  pct_1rm_suggested?: number | null;
  rest_seconds?: number | null;
  athlete_id?: number | string | null;
  athleteId?: number | string | null;
  athlete_name?: string | null;
  athleteName?: string | null;
}) {
  const maybeUpdateOneRm = async (context?: {
    athleteId?: number | string | null;
    athleteName?: string | null;
  }) => {
    // Skip 1RM estimation for bodyweight sets
    if (isBodyweight(payload.weight)) return null;
    const estimate = estimateOneRm(Number(payload.weight), Number(payload.reps));
    if (!estimate) return null;
    const athleteId = context?.athleteId ?? null;
    const athleteName = context?.athleteName ?? null;
    if (athleteId === null && !athleteName) return null;
    const existing = await get1RM({ athleteName, athleteId });
    const existingByExercise = new Map<number, number>(
      (existing || []).map((record: any) => [
        record.exercise_id,
        Number(record.weight ?? 0),
      ]),
    );
    const current = existingByExercise.get(payload.exercise_id) ?? 0;
    if (estimate <= current) return null;
    if (
      canUseSupabase() &&
      (athleteId === null || athleteId === undefined || athleteId === "")
    ) {
      return null;
    }
    await update1RM({
      athlete_id: athleteId ?? undefined,
      athlete_name: athleteName ?? undefined,
      exercise_id: payload.exercise_id,
      one_rm: estimate,
    });
    return estimate;
  };

  const resolveAthleteContext = (runs?: any[]) => {
    const athleteId = payload.athlete_id ?? payload.athleteId ?? null;
    const athleteName = payload.athlete_name ?? payload.athleteName ?? null;
    if (athleteId !== null || athleteName) {
      return { athleteId, athleteName };
    }
    if (!runs) return { athleteId: null, athleteName: null };
    const run = runs.find((entry: any) => entry.id === payload.run_id);
    return {
      athleteId: run?.athlete_id ?? null,
      athleteName: run?.athlete_name ?? null,
    };
  };

  if (canUseSupabase()) {
    const { error } = await supabase
      .from("strength_set_logs")
      .insert(createSetLogDbPayload(payload));
    if (error) throw new Error(error.message);
    const context = resolveAthleteContext();
    const updated = await maybeUpdateOneRm(context);
    return {
      status: "ok",
      one_rm_updated: Boolean(updated),
      one_rm: updated ?? undefined,
    };
  }

  const runs = (localStorageGet(STORAGE_KEYS.STRENGTH_RUNS) || []) as any[];
  const runIndex = runs.findIndex((entry: any) => entry.id === payload.run_id);
  const baseRun =
    runIndex >= 0 ? runs[runIndex] : { id: payload.run_id, logs: [] };
  const updatedLogs = [
    ...(baseRun.logs || []),
    { ...payload, completed_at: new Date().toISOString() },
  ];
  const updatedRun = { ...baseRun, logs: updatedLogs };
  const nextRuns =
    runIndex >= 0
      ? [...runs.slice(0, runIndex), updatedRun, ...runs.slice(runIndex + 1)]
      : [...runs, updatedRun];
  localStorageSave(STORAGE_KEYS.STRENGTH_RUNS, nextRuns);
  const context = resolveAthleteContext(nextRuns);
  const updated = await maybeUpdateOneRm(context);
  return {
    status: "ok",
    one_rm_updated: Boolean(updated),
    one_rm: updated ?? undefined,
  };
}

export async function updateStrengthRun(update: {
  run_id: number;
  progress_pct?: number;
  status?: "in_progress" | "completed" | "abandoned";
  [key: string]: any;
}) {
  if (canUseSupabase()) {
    const updatePayload = buildRunUpdatePayload(update);
    const { error } = await supabase
      .from("strength_session_runs")
      .update(updatePayload)
      .eq("id", update.run_id);
    if (error) throw new Error(error.message);
    if (update.status === "completed" && update.assignment_id) {
      await supabase
        .from("session_assignments")
        .update({ status: "completed" })
        .eq("id", update.assignment_id);
    }
    return { status: "ok" };
  }

  const runs = (localStorageGet(STORAGE_KEYS.STRENGTH_RUNS) || []) as any[];
  const runIndex = runs.findIndex((entry: any) => entry.id === update.run_id);
  const now = new Date().toISOString();
  const baseRun =
    runIndex >= 0 ? runs[runIndex] : { id: update.run_id, started_at: now };
  const updatedRun = {
    ...baseRun,
    ...update,
    id: update.run_id,
    updated_at: now,
  };
  if (update.status === "completed" && !updatedRun.completed_at) {
    updatedRun.completed_at = now;
  }
  if (update.status === "completed") {
    const assignmentId = update.assignment_id ?? baseRun.assignment_id;
    if (assignmentId) {
      const assignments = (localStorageGet(STORAGE_KEYS.ASSIGNMENTS) || []) as any[];
      const updatedAssignments = assignments.map((assignment: any) =>
        assignment.id === assignmentId
          ? { ...assignment, status: "completed" }
          : assignment,
      );
      localStorageSave(STORAGE_KEYS.ASSIGNMENTS, updatedAssignments);
    }
  }
  const nextRuns =
    runIndex >= 0
      ? [...runs.slice(0, runIndex), updatedRun, ...runs.slice(runIndex + 1)]
      : [...runs, updatedRun];
  localStorageSave(STORAGE_KEYS.STRENGTH_RUNS, nextRuns);
  return { status: "ok" };
}

export async function deleteStrengthRun(runId: number) {
  if (canUseSupabase()) {
    const { error } = await supabase
      .from("strength_session_runs")
      .delete()
      .eq("id", runId);
    if (error) throw new Error(error.message);
    return { status: "deleted", source: "remote" as const };
  }

  const runs = (localStorageGet(STORAGE_KEYS.STRENGTH_RUNS) || []) as any[];
  const target = runs.find((entry: any) => entry.id === runId);
  const updatedRuns = runs.filter((entry: any) => entry.id !== runId);
  localStorageSave(STORAGE_KEYS.STRENGTH_RUNS, updatedRuns);
  if (target?.assignment_id) {
    const assignments = (localStorageGet(STORAGE_KEYS.ASSIGNMENTS) || []) as any[];
    const nextAssignments = assignments.map((assignment: any) =>
      assignment.id === target.assignment_id
        ? { ...assignment, status: "assigned" }
        : assignment,
    );
    localStorageSave(STORAGE_KEYS.ASSIGNMENTS, nextAssignments);
  }
  return { status: "deleted", source: "local" as const };
}

export async function saveStrengthRun(run: any) {
  if (canUseSupabase()) {
    let runId = run.run_id;
    // Step 1: Create run if needed
    if (!runId) {
      const { data: newRun, error } = await supabase
        .from("strength_session_runs")
        .insert({
          assignment_id: run.assignment_id ?? null,
          athlete_id: run.athlete_id ?? null,
          status: "in_progress",
          progress_pct: run.progress_pct ?? 0,
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      runId = newRun.id;
    }

    // Step 2: Insert all set logs
    if (runId && Array.isArray(run.logs) && run.logs.length > 0) {
      const { error: logsError } = await supabase
        .from("strength_set_logs")
        .insert(mapLogsForDbInsert(run.logs, runId));
      if (logsError) throw new Error(logsError.message);
    }

    // Step 3: Calculate 1RM estimates and upsert records
    const estimatedRecords = collectEstimated1RMs(
      Array.isArray(run.logs) ? run.logs : [],
    );
    if (estimatedRecords.size > 0) {
      const athleteId = run.athlete_id ?? null;
      const athleteName = run.athlete_name ?? null;
      if (
        athleteId !== null &&
        athleteId !== undefined &&
        athleteId !== ""
      ) {
        const existing = await get1RM({ athleteName, athleteId });
        const existingByExercise = new Map<number, number>(
          (existing || []).map((record: any) => [
            record.exercise_id,
            Number(record.weight ?? 0),
          ]),
        );
        await Promise.all(
          Array.from(estimatedRecords.entries())
            .filter(
              ([exerciseId, estimate]) =>
                estimate > (existingByExercise.get(exerciseId) ?? 0),
            )
            .map(([exerciseId, estimate]) =>
              update1RM({
                athlete_id: athleteId ?? undefined,
                athlete_name: athleteName ?? undefined,
                exercise_id: exerciseId,
                one_rm: estimate,
              }),
            ),
        );
      }
    }

    // Step 4: Mark run as completed
    if (runId) {
      await supabase
        .from("strength_session_runs")
        .update({
          progress_pct: run.progress_pct ?? 100,
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }

    // Step 5: Mark assignment completed if applicable
    if (run.assignment_id) {
      await supabase
        .from("session_assignments")
        .update({ status: "completed" })
        .eq("id", run.assignment_id);
    }
    return { status: "ok", run_id: runId ?? null };
  }

  const runs = (localStorageGet(STORAGE_KEYS.STRENGTH_RUNS) || []) as any[];
  const runId = run.run_id ?? Date.now();
  const existingRun = runs.find((entry: any) => entry.id === runId) || {};
  const completedRun = {
    ...existingRun,
    ...run,
    id: runId,
    status: "completed",
    started_at:
      existingRun.started_at ??
      run.started_at ??
      run.date ??
      new Date().toISOString(),
    completed_at: new Date().toISOString(),
  };
  localStorageSave(STORAGE_KEYS.STRENGTH_RUNS, [
    ...runs.filter((entry: any) => entry.id !== runId),
    completedRun,
  ]);
  if (run.assignment_id) {
    const assignments = (localStorageGet(STORAGE_KEYS.ASSIGNMENTS) || []) as any[];
    const updated = assignments.map((assignment: any) =>
      assignment.id === run.assignment_id
        ? { ...assignment, status: "completed" }
        : assignment,
    );
    localStorageSave(STORAGE_KEYS.ASSIGNMENTS, updated);
  }
  const estimatedRecords = collectEstimated1RMs(
    Array.isArray(run.logs) ? run.logs : [],
  );
  if (estimatedRecords.size > 0) {
    const athleteId = run.athlete_id ?? null;
    const athleteName = run.athlete_name ?? null;
    const existing = await get1RM({ athleteName, athleteId });
    const existingByExercise = new Map<number, number>(
      (existing || []).map((record: any) => [
        record.exercise_id,
        Number(record.weight ?? 0),
      ]),
    );
    await Promise.all(
      Array.from(estimatedRecords.entries())
        .filter(
          ([exerciseId, estimate]) =>
            estimate > (existingByExercise.get(exerciseId) ?? 0),
        )
        .map(([exerciseId, estimate]) =>
          update1RM({
            athlete_id: athleteId ?? undefined,
            athlete_name: athleteName ?? undefined,
            exercise_id: exerciseId,
            one_rm: estimate,
          }),
        ),
    );
  }
  return { status: "ok", run_id: runId };
}

// --- History ---

export async function getStrengthHistory(
  athleteName: string,
  options?: {
    athleteId?: number | string | null;
    limit?: number;
    offset?: number;
    order?: "asc" | "desc";
    status?: string;
    from?: string;
    to?: string;
  },
): Promise<StrengthHistoryResult> {
  const limitRaw = options?.limit ?? 50;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Number(limitRaw), 1), 200)
    : 50;
  const offsetRaw = options?.offset ?? 0;
  const offset = Number.isFinite(offsetRaw) ? Math.max(Number(offsetRaw), 0) : 0;
  const order = options?.order === "asc" ? "asc" : "desc";
  const athleteId = options?.athleteId;
  const hasAthleteId =
    athleteId !== null && athleteId !== undefined && athleteId !== "";

  if (canUseSupabase()) {
    let query = supabase
      .from("strength_session_runs")
      .select("*, strength_set_logs(*)")
      .order("started_at", { ascending: order === "asc" })
      .range(offset, offset + limit - 1);
    if (hasAthleteId) {
      query = query.eq("athlete_id", Number(athleteId));
    }
    if (options?.status) {
      query = query.eq("status", options.status);
    }
    if (options?.from) {
      query = query.gte("started_at", options.from);
    }
    if (options?.to) {
      query = query.lte("started_at", options.to + "T23:59:59");
    }
    const { data: runs, error, count } = await query;
    if (error) throw new Error(error.message);
    return {
      runs: runs ?? [],
      pagination: { limit, offset, total: count ?? (runs ?? []).length },
      exercise_summary: [],
    };
  }

  const runs = (localStorageGet(STORAGE_KEYS.STRENGTH_RUNS) || []) as any[];
  const filtered = runs.filter((r: any) => {
    if (hasAthleteId && String(r.athlete_id) !== String(athleteId)) {
      return false;
    }
    if (!hasAthleteId && athleteName && r.athlete_name !== athleteName) {
      return false;
    }
    if (options?.status && r.status !== options.status) {
      return false;
    }
    if (options?.from || options?.to) {
      const dateValue = new Date(
        r.date || r.started_at || r.created_at || 0,
      ).getTime();
      if (options?.from) {
        const fromTime = new Date(options.from).getTime();
        if (Number.isFinite(fromTime) && dateValue < fromTime) {
          return false;
        }
      }
      if (options?.to) {
        const toDate = new Date(options.to);
        toDate.setHours(23, 59, 59, 999);
        const toTime = toDate.getTime();
        if (Number.isFinite(toTime) && dateValue > toTime) {
          return false;
        }
      }
    }
    return true;
  });
  const sorted = filtered.sort((a: any, b: any) => {
    const aDate = new Date(a.date || a.started_at || a.created_at || 0).getTime();
    const bDate = new Date(b.date || b.started_at || b.created_at || 0).getTime();
    return order === "asc" ? aDate - bDate : bDate - aDate;
  });
  const exercises = (localStorageGet(STORAGE_KEYS.EXERCISES) || []) as any[];
  const exerciseMap = new Map(
    (Array.isArray(exercises) ? exercises : []).map((exercise: any) => [
      safeInt(exercise.id),
      exercise.nom_exercice || exercise.name || `Exercice ${exercise.id}`,
    ]),
  );
  const exerciseSummaryMap = new Map<number, StrengthExerciseSummary>();
  sorted.forEach((run: any) => {
    (run.logs || []).forEach((log: any) => {
      const exerciseId = safeInt(log.exercise_id);
      if (!exerciseId) return;
      const current = exerciseSummaryMap.get(exerciseId) || {
        exercise_id: exerciseId,
        exercise_name:
          exerciseMap.get(exerciseId) || `Exercice ${exerciseId}`,
        total_sets: 0,
        total_reps: 0,
        total_volume: 0,
        max_weight: null,
        last_performed_at: null,
      };
      const reps = Number(log.reps ?? 0) || 0;
      const rawWeight = log.weight;
      const weight = isBodyweight(rawWeight) ? 0 : (Number(rawWeight ?? 0) || 0);
      current.total_sets += 1;
      current.total_reps += reps;
      current.total_volume += reps * weight;
      if (!isBodyweight(rawWeight)) {
        current.max_weight =
          Math.max(current.max_weight ?? 0, weight) || current.max_weight;
      }
      const completedAt =
        log.completed_at || run.completed_at || run.started_at || null;
      if (completedAt) {
        const completedAtTime = new Date(completedAt).getTime();
        const currentTime = current.last_performed_at
          ? new Date(current.last_performed_at).getTime()
          : 0;
        if (!current.last_performed_at || completedAtTime > currentTime) {
          current.last_performed_at = completedAt;
        }
      }
      exerciseSummaryMap.set(exerciseId, current);
    });
  });
  const total = sorted.length;
  const page = sorted.slice(offset, offset + limit);
  const exercise_summary = Array.from(exerciseSummaryMap.values()).sort(
    (a, b) => b.total_volume - a.total_volume,
  );
  return { runs: page, pagination: { limit, offset, total }, exercise_summary };
}

export async function getStrengthHistoryAggregate(
  athleteName: string,
  options?: {
    athleteId?: number | string | null;
    period?: "day" | "week" | "month";
    limit?: number;
    offset?: number;
    order?: "asc" | "desc";
    status?: string;
    from?: string;
    to?: string;
  },
): Promise<StrengthHistoryAggregateResult> {
  const limitRaw = options?.limit ?? 200;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Number(limitRaw), 1), 200)
    : 200;
  const offsetRaw = options?.offset ?? 0;
  const offset = Number.isFinite(offsetRaw) ? Math.max(Number(offsetRaw), 0) : 0;
  const order = options?.order === "asc" ? "asc" : "desc";
  const athleteId = options?.athleteId;
  const hasAthleteId =
    athleteId !== null && athleteId !== undefined && athleteId !== "";
  const period = options?.period ?? "day";

  if (canUseSupabase()) {
    const rpcParams: Record<string, unknown> = { p_period: period };
    if (hasAthleteId) rpcParams.p_athlete_id = Number(athleteId);
    if (options?.from) rpcParams.p_from = options.from;
    if (options?.to) rpcParams.p_to = options.to;
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "get_strength_history_aggregate",
      rpcParams,
    );
    if (rpcError) throw new Error(rpcError.message);
    const periods = Array.isArray(rpcData) ? rpcData : [];
    return { periods, pagination: { limit, offset, total: periods.length } };
  }

  const runs = (localStorageGet(STORAGE_KEYS.STRENGTH_RUNS) || []) as any[];
  const filtered = runs.filter((r: any) => {
    if (hasAthleteId) {
      return r.athlete_id
        ? String(r.athlete_id) === String(athleteId)
        : false;
    }
    return r.athlete_name === athleteName;
  });
  const fromDate = options?.from ? new Date(options.from) : null;
  const toDate = options?.to ? new Date(options.to) : null;
  const periodEntries = new Map<string, StrengthHistoryAggregateEntry>();
  const getPeriodKey = (date: Date) => {
    if (period === "month") {
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    }
    if (period === "week") {
      const temp = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
      );
      const day = temp.getUTCDay() || 7;
      temp.setUTCDate(temp.getUTCDate() + 4 - day);
      const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil(
        ((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
      );
      return `${temp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
    }
    return date.toISOString().split("T")[0];
  };
  filtered.forEach((run: any) => {
    const logs = Array.isArray(run.logs) ? run.logs : [];
    logs.forEach((log: any) => {
      const dateValue =
        log.completed_at || run.started_at || run.date || run.created_at;
      if (!dateValue) return;
      const date = new Date(dateValue);
      if (Number.isNaN(date.getTime())) return;
      if (fromDate && date < fromDate) return;
      if (toDate && date > toDate) return;
      const key = getPeriodKey(date);
      const entry = periodEntries.get(key) || {
        period: key,
        tonnage: 0,
        volume: 0,
      };
      const reps = Number(log.reps) || 0;
      const weight = Number(log.weight) || 0;
      entry.volume += reps;
      entry.tonnage += reps * weight;
      periodEntries.set(key, entry);
    });
  });
  const sortedPeriods = Array.from(periodEntries.values()).sort((a, b) => {
    if (order === "asc") {
      return a.period.localeCompare(b.period);
    }
    return b.period.localeCompare(a.period);
  });
  const total = sortedPeriods.length;
  const page = sortedPeriods.slice(offset, offset + limit);
  return { periods: page, pagination: { limit, offset, total } };
}

// --- 1RM ---

export async function get1RM(
  athlete:
    | string
    | { athleteName?: string | null; athleteId?: number | string | null },
) {
  const athleteName =
    typeof athlete === "string" ? athlete : (athlete?.athleteName ?? null);
  const athleteId =
    typeof athlete === "string" ? null : (athlete?.athleteId ?? null);
  if (canUseSupabase()) {
    let query = supabase.from("one_rm_records").select("*");
    if (
      athleteId !== null &&
      athleteId !== undefined &&
      String(athleteId) !== ""
    ) {
      query = query.eq("athlete_id", Number(athleteId));
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((record: any) => ({
      id: safeOptionalInt(record.id),
      athlete_id: safeOptionalInt(record.athlete_id),
      exercise_id: safeInt(record.exercise_id),
      weight: Number(record.one_rm ?? 0),
      recorded_at: record.recorded_at ?? null,
      notes: (record.notes as string) ?? null,
    }));
  }
  const records = (localStorageGet(STORAGE_KEYS.ONE_RM) || []) as any[];
  return records.filter((r: any) => r.athlete_name === athleteName);
}

export async function update1RM(record: {
  athlete_id?: number | string | null;
  athleteId?: number | string | null;
  athlete_name?: string | null;
  athleteName?: string | null;
  exercise_id: number;
  one_rm?: number;
  weight?: number;
  notes?: string | null;
}) {
  if (canUseSupabase()) {
    const athleteId = record.athlete_id ?? record.athleteId;
    const oneRm = record.one_rm ?? record.weight;
    if (
      athleteId === null ||
      athleteId === undefined ||
      athleteId === "" ||
      oneRm === null ||
      oneRm === undefined
    ) {
      throw new Error("athlete_id et one_rm sont requis");
    }
    const payload: Record<string, unknown> = {
      athlete_id: Number(athleteId),
      exercise_id: record.exercise_id,
      one_rm: oneRm,
      recorded_at: new Date().toISOString(),
    };
    if (record.notes !== undefined) payload.notes = record.notes;
    const { error } = await supabase.from("one_rm_records").upsert(
      payload,
      { onConflict: "athlete_id,exercise_id" },
    );
    if (error) throw new Error(error.message);
    return { status: "ok" };
  }
  const records = (localStorageGet(STORAGE_KEYS.ONE_RM) || []) as any[];
  const athleteName = record.athlete_name ?? record.athleteName;
  const filtered = records.filter(
    (r: any) =>
      !(r.athlete_name === athleteName && r.exercise_id === record.exercise_id),
  );
  localStorageSave(STORAGE_KEYS.ONE_RM, [
    ...filtered,
    {
      ...record,
      athlete_name: athleteName,
      id: Date.now(),
      date: new Date().toISOString(),
    },
  ]);
  return { status: "ok" };
}

export async function updateExerciseNote(params: {
  athlete_id: number | string;
  exercise_id: number;
  notes: string | null;
}) {
  if (canUseSupabase()) {
    // Try updating existing row first
    const { data: updated, error: updateError } = await supabase
      .from("one_rm_records")
      .update({ notes: params.notes })
      .eq("athlete_id", Number(params.athlete_id))
      .eq("exercise_id", params.exercise_id)
      .select("id");
    if (updateError) throw new Error(updateError.message);
    // If no row existed, insert one with one_rm=0
    if (!updated || updated.length === 0) {
      const { error: insertError } = await supabase
        .from("one_rm_records")
        .insert({
          athlete_id: Number(params.athlete_id),
          exercise_id: params.exercise_id,
          notes: params.notes,
          one_rm: 0,
          recorded_at: new Date().toISOString(),
        });
      if (insertError) throw new Error(insertError.message);
    }
    return { status: "ok" };
  }
  const records = (localStorageGet(STORAGE_KEYS.ONE_RM) || []) as any[];
  const idx = records.findIndex(
    (r: any) =>
      String(r.athlete_id) === String(params.athlete_id) &&
      r.exercise_id === params.exercise_id,
  );
  if (idx >= 0) {
    records[idx].notes = params.notes;
  } else {
    records.push({
      athlete_id: Number(params.athlete_id),
      exercise_id: params.exercise_id,
      one_rm: 0,
      notes: params.notes,
      id: Date.now(),
      date: new Date().toISOString(),
    });
  }
  localStorageSave(STORAGE_KEYS.ONE_RM, records);
  return { status: "ok" };
}

// --- Strength Folders ---

function mapFolder(row: any): StrengthFolder {
  return {
    id: safeInt(row.id),
    name: String(row.name || ""),
    type: row.type as 'session' | 'exercise',
    sort_order: safeInt(row.sort_order),
    parent_id: row.parent_id != null ? safeInt(row.parent_id) : null,
    athlete_id: row.athlete_id != null ? safeInt(row.athlete_id) : null,
  };
}

export async function getStrengthFolders(
  type: 'session' | 'exercise',
  opts?: { athleteId?: number | null; parentId?: number | null },
): Promise<StrengthFolder[]> {
  if (canUseSupabase()) {
    let query = supabase
      .from("strength_folders")
      .select("*")
      .eq("type", type);

    if (opts?.athleteId !== undefined) {
      if (opts.athleteId === null) {
        // Global/common folders: no athlete, no parent (root level)
        query = query.is("athlete_id", null).is("parent_id", null);
      } else {
        // Athlete-specific: fetch root folders for this athlete, then children
        const { data: roots, error: rootErr } = await query
          .eq("athlete_id", opts.athleteId)
          .is("parent_id", null)
          .order("sort_order", { ascending: true });
        if (rootErr) throw new Error(rootErr.message);
        const rootFolders = (roots ?? []).map(mapFolder);
        if (rootFolders.length === 0) return [];
        const rootIds = rootFolders.map((f) => f.id);
        const { data: children, error: childErr } = await supabase
          .from("strength_folders")
          .select("*")
          .eq("type", type)
          .in("parent_id", rootIds)
          .order("sort_order", { ascending: true });
        if (childErr) throw new Error(childErr.message);
        const allFolders = [...rootFolders, ...(children ?? []).map(mapFolder)];
        if (opts.parentId !== undefined && opts.parentId !== null) {
          return allFolders.filter((f) => f.parent_id === opts.parentId);
        }
        return allFolders;
      }
    }

    if (opts?.parentId !== undefined) {
      if (opts.parentId === null) {
        query = query.is("parent_id", null);
      } else {
        query = query.eq("parent_id", opts.parentId);
      }
    }

    const { data, error } = await query.order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapFolder);
  }
  return [];
}

export async function createStrengthFolder(
  name: string,
  type: 'session' | 'exercise',
  opts?: { parentId?: number | null; athleteId?: number | null },
): Promise<StrengthFolder> {
  if (!canUseSupabase()) throw new Error("Supabase requis");
  const { data, error } = await supabase
    .from("strength_folders")
    .insert({
      name,
      type,
      parent_id: opts?.parentId ?? null,
      athlete_id: opts?.athleteId ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapFolder(data);
}

export async function renameStrengthFolder(id: number, name: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase requis");
  const { error } = await supabase.from("strength_folders").update({ name }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteStrengthFolder(id: number): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase requis");
  const { error } = await supabase.from("strength_folders").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function moveToFolder(
  itemId: number,
  folderId: number | null,
  table: 'strength_sessions' | 'dim_exercices',
): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase requis");
  const { error } = await supabase.from(table).update({ folder_id: folderId }).eq("id", itemId);
  if (error) throw new Error(error.message);
}
