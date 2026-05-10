/**
 * Swim sessions API — CRUD pour la table dim_sessions.
 * §219 — Migré depuis src/lib/api.ts (kill de la façade).
 *
 * NOTE 23505 dedup dans syncSession :
 * Depuis migration 00116 l'index unique est (athlete_id, session_date,
 * time_slot) sans assignment_id. Sur conflit on UPDATE l'existant en
 * place, en préservant assignment_id si l'incoming est null (sinon on
 * perdrait le lien coach ↔ log lors d'une saisie via flow non-coach).
 */

import {
  supabase,
  canUseSupabase,
  delay,
  expandScaleToTen,
  normalizeScaleToFive,
  STORAGE_KEYS,
  assertSupabase,
} from "./client";
import {
  mapToDbSession,
  mapFromDbSession,
  type SyncSessionInputWithId,
} from "./helpers";
import { localStorageGet, localStorageSave } from "./localStorage";
import type { Session, ApiCapabilities, SwimExerciseLogInput } from "./types";
import { saveSwimExerciseLogs } from "./swim-logs";

// ── Capabilities ──
export async function getCapabilities(): Promise<ApiCapabilities> {
  if (!canUseSupabase()) {
    return {
      mode: "local",
      version: null,
      timesheet: { available: true },
      messaging: { available: true },
    };
  }
  return {
    mode: "supabase",
    version: null,
    timesheet: { available: true },
    messaging: { available: true },
  };
}

// ── Swim Sessions ──
export async function syncSession(
  session: SyncSessionInputWithId,
): Promise<{ status: string; sessionId: number }> {
  if (canUseSupabase()) {
    const dbPayload = mapToDbSession(session);
    const { data, error } = await supabase.from("dim_sessions").insert(dbPayload).select("id").single();
    if (error) {
      // Resolve 23505 by UPDATE. Since migration 00116 the dedup index is
      // (athlete_id, session_date, time_slot) regardless of assignment_id,
      // so we look up the existing row by the full slot key and promote it
      // in place. Preserving `assignment_id` when the incoming payload is
      // unlinked avoids dropping a coach ↔ log association that the UI
      // path may not carry.
      if (error.code === '23505') {
        const athleteId = dbPayload.athlete_id;
        const sessionDate = dbPayload.session_date;
        const timeSlot = dbPayload.time_slot;
        if (athleteId == null || !sessionDate || !timeSlot) throw new Error(error.message);

        const { data: existing, error: findErr } = await supabase
          .from("dim_sessions")
          .select("id, assignment_id")
          .eq("athlete_id", Number(athleteId))
          .eq("session_date", String(sessionDate))
          .eq("time_slot", String(timeSlot))
          .maybeSingle();
        if (findErr) throw new Error(findErr.message);
        if (!existing?.id) throw new Error(error.message);

        const updatePayload = {
          ...dbPayload,
          assignment_id: dbPayload.assignment_id ?? (existing as { assignment_id: number | null }).assignment_id ?? null,
        };

        const { error: updErr } = await supabase
          .from("dim_sessions")
          .update(updatePayload)
          .eq("id", existing.id);
        if (updErr) throw new Error(updErr.message);
        return { status: "ok", sessionId: existing.id as number };
      }
      throw new Error(error.message);
    }
    return { status: "ok", sessionId: data.id };
  }

  await delay(300);
  const sessions = localStorageGet<Session[]>(STORAGE_KEYS.SESSIONS) || [];
  const newId = Date.now();
  const newSession = { ...session, id: newId, created_at: new Date().toISOString() };
  localStorageSave(STORAGE_KEYS.SESSIONS, [...sessions, newSession]);
  return { status: "ok", sessionId: newId };
}

export async function ensureSwimSession(params: {
  athleteName: string;
  athleteId?: number | string | null;
  date: string;
  slot: string;
}): Promise<number> {
  if (!canUseSupabase()) throw new Error("Supabase required");

  let query = supabase
    .from("dim_sessions")
    .select("id")
    .eq("session_date", params.date)
    .eq("time_slot", params.slot);

  if (params.athleteId) {
    query = query.eq("athlete_id", Number(params.athleteId));
  } else {
    query = query.eq("athlete_name", params.athleteName);
  }

  const { data: existing } = await query.maybeSingle();
  if (existing?.id) return existing.id as number;

  const payload: Record<string, unknown> = {
    athlete_name: params.athleteName,
    session_date: params.date,
    time_slot: params.slot,
    distance: 0,
    duration: 0,
    rpe: 10,
    performance: 10,
    engagement: 10,
    fatigue: 10,
  };
  if (params.athleteId) payload.athlete_id = Number(params.athleteId);

  const data = assertSupabase(
    await supabase
      .from("dim_sessions")
      .insert(payload)
      .select("id")
      .single()
  )!;
  return data.id as number;
}

/**
 * §262 — Atomic save of a swim session + its exercise logs in 1 round-trip.
 *
 * Calls the Postgres RPC `save_swim_session_atomic` (migration 00159) which
 * finds-or-creates the dim_sessions row and replaces the user's swim_exercise_logs
 * for that session in a single transaction. Returns `dim_sessions.id`.
 *
 * Falls back byte-identically to the legacy sequence (`ensureSwimSession` +
 * `saveSwimExerciseLogs`) if the RPC errors — migration not yet deployed,
 * transient network issue caught client-side, etc. The `athleteName` /
 * `athleteId` arguments are only needed by the fallback; the RPC derives both
 * from `auth.uid()` + `app_user_id()` internally.
 *
 * Idempotent under replay: the RPC's DELETE-then-INSERT on swim_exercise_logs
 * makes re-running with the same payload safe (key invariant for §251 offline
 * queue replay).
 */
export async function saveSwimSessionAtomic(params: {
  athleteName: string;
  athleteId?: number | string | null;
  date: string;
  slot: string;
  logs: SwimExerciseLogInput[];
}): Promise<number> {
  if (!canUseSupabase()) throw new Error("Supabase required");

  const logsJsonb = params.logs.map((log) => ({
    exercise_label: log.exercise_label,
    source_item_id: log.source_item_id ?? null,
    split_times: log.split_times ?? [],
    tempo: log.tempo ?? null,
    stroke_count: log.stroke_count ?? [],
    notes: log.notes ?? null,
    event_code: log.event_code ?? null,
    pool_length: log.pool_length ?? null,
    equipment: log.equipment ?? ["aucun"],
  }));

  try {
    const { data, error } = await supabase.rpc("save_swim_session_atomic", {
      p_date: params.date,
      p_slot: params.slot,
      p_logs: logsJsonb,
    });
    if (!error && data != null) return Number(data);
    // RPC errored or returned null — fall through to legacy.
  } catch {
    // Network / RPC build error — fall through.
  }

  // Legacy fallback: 2-step sequence preserved verbatim.
  const sessionId = await ensureSwimSession({
    athleteName: params.athleteName,
    athleteId: params.athleteId,
    date: params.date,
    slot: params.slot,
  });

  const { data: authData } = await supabase.auth.getSession();
  const authUid = authData.session?.user?.id;
  if (!authUid) throw new Error("Non authentifié");

  await saveSwimExerciseLogs(sessionId, authUid, params.logs);
  return sessionId;
}

export async function getSessions(
  athleteName: string,
  athleteId?: number | string | null,
): Promise<Session[]> {
  const hasAthleteId = athleteId !== null && athleteId !== undefined && String(athleteId) !== "";
  if (canUseSupabase()) {
    let query = supabase
      .from("dim_sessions")
      .select("*")
      .order("session_date", { ascending: false })
      .limit(200);
    if (hasAthleteId) {
      query = query.eq("athlete_id", Number(athleteId));
    } else {
      query = query.eq("athlete_name", athleteName);
    }
    const data = assertSupabase(await query);
    return (data ?? [])
      .map(mapFromDbSession)
      .filter((session): session is Session => Boolean(session));
  }

  await delay(200);
  const sessions = localStorageGet<Session[]>(STORAGE_KEYS.SESSIONS) || [];
  return sessions
    .filter((s: Session) => {
      if (hasAthleteId) {
        return s.athlete_id ? String(s.athlete_id) === String(athleteId) : s.athlete_name.toLowerCase() === athleteName.toLowerCase();
      }
      return s.athlete_name.toLowerCase() === athleteName.toLowerCase();
    })
    .map((session: Session) => ({
      ...session,
      effort: normalizeScaleToFive(session.effort) ?? session.effort,
      feeling: normalizeScaleToFive(session.feeling) ?? session.feeling,
      rpe: normalizeScaleToFive(session.rpe ?? null),
      performance: normalizeScaleToFive(session.performance ?? null),
      engagement: normalizeScaleToFive(session.engagement ?? null),
      fatigue: normalizeScaleToFive(session.fatigue ?? null),
    }))
    .sort((a: Session, b: Session) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function updateSession(session: Session): Promise<{ status: string }> {
  if (canUseSupabase()) {
    const dbPayload: Record<string, unknown> = {
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
    if (session.assignment_id != null) {
      dbPayload.assignment_id = session.assignment_id;
    }
    assertSupabase(await supabase.from("dim_sessions").update(dbPayload).eq("id", session.id));
    return { status: "updated" };
  }

  await delay(200);
  const sessions = localStorageGet<Session[]>(STORAGE_KEYS.SESSIONS) || [];
  const index = sessions.findIndex((entry: Session) => entry.id === session.id);
  if (index === -1) {
    return { status: "missing" };
  }
  const updatedSessions = [...sessions];
  updatedSessions[index] = { ...updatedSessions[index], ...session };
  localStorageSave(STORAGE_KEYS.SESSIONS, updatedSessions);
  return { status: "updated" };
}

export async function deleteSession(sessionId: number): Promise<{ status: string }> {
  if (canUseSupabase()) {
    assertSupabase(await supabase.from("dim_sessions").delete().eq("id", sessionId));
    return { status: "deleted" };
  }

  await delay(200);
  const sessions = localStorageGet<Session[]>(STORAGE_KEYS.SESSIONS) || [];
  const updatedSessions = sessions.filter((session: Session) => session.id !== sessionId);
  localStorageSave(STORAGE_KEYS.SESSIONS, updatedSessions);
  return { status: "deleted" };
}

export async function updateSessionCoachNotes(sessionId: number, notes: string | null): Promise<void> {
  if (!canUseSupabase()) return;
  assertSupabase(
    await supabase
      .from("dim_sessions")
      .update({ coach_notes: notes })
      .eq("id", sessionId)
  );
}
