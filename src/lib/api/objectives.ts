/**
 * API Objectives - CRUD for coach objective management
 */

import { supabase, canUseSupabase, assertSupabase } from "./client";
import type { Objective, ObjectiveInput } from "./types";

export async function getObjectives(athleteId?: string): Promise<Objective[]> {
  if (!canUseSupabase()) return [];

  // Query 1: objectives + competitions (legacy 1:1 embed for back-compat fields)
  // Disambiguate the FK: PostgREST sees two paths to competitions since §193
  // (legacy objectives.competition_id + new objective_competitions join). We
  // pin the embed to the legacy direct FK explicitly.
  let query = supabase
    .from("objectives")
    .select("*, competitions!objectives_competition_id_fkey(name, date)")
    .order("created_at", { ascending: false });
  if (athleteId) {
    query = query.eq("athlete_id", athleteId);
  }
  const data = assertSupabase(await query);
  const objectives = data ?? [];

  // Query 2: join table — fetched separately so a stale PostgREST schema
  // cache for the new objective_competitions relation doesn't break the
  // whole objectives flow. We filter by the same scope (athlete or all).
  const objectiveIds = objectives.map((o: any) => o.id).filter(Boolean);
  let linksByObjective = new Map<string, string[]>();
  if (objectiveIds.length > 0) {
    const { data: linkData, error: linkErr } = await supabase
      .from("objective_competitions")
      .select("objective_id, competition_id")
      .in("objective_id", objectiveIds);
    if (linkErr) {
      // Tolerate schema/RLS hiccups: log and proceed with empty competition_ids.
      // The legacy column on objectives is still populated for old rows so
      // back-compat callers keep working; new callers see [] (graceful).
      // eslint-disable-next-line no-console
      console.warn("[getObjectives] objective_competitions fetch failed:", linkErr.message);
    } else {
      for (const row of linkData ?? []) {
        const list = linksByObjective.get(row.objective_id) ?? [];
        list.push(row.competition_id);
        linksByObjective.set(row.objective_id, list);
      }
    }
  }

  return objectives.map((row: any) => ({
    id: row.id,
    athlete_id: row.athlete_id,
    competition_id: row.competition_id,
    competition_ids: linksByObjective.get(row.id) ?? [],
    event_code: row.event_code,
    pool_length: row.pool_length,
    target_time_seconds: row.target_time_seconds != null ? Number(row.target_time_seconds) : null,
    text: row.text,
    created_by: row.created_by,
    created_at: row.created_at,
    competition_name: row.competitions?.name ?? null,
    competition_date: row.competitions?.date ?? null,
  })) as Objective[];
}

export async function getAthleteObjectives(): Promise<Objective[]> {
  if (!canUseSupabase()) return [];
  const { data: { user } } = await supabase.auth.getUser();
  // Throw on missing user instead of returning [] so React Query treats it
  // as an error (no success cache pollution). Without this, a query firing
  // during the auth-bootstrap window would cache an empty array under the
  // shared ["athlete-objectives"] key and never refresh, leaving views like
  // AddObjectiveSheet showing 0 linkable objectives forever.
  if (!user) throw new Error("Auth session not ready");
  return getObjectives(user.id);
}

export async function createObjective(input: ObjectiveInput): Promise<Objective> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data: { user } } = await supabase.auth.getUser();

  // Insert into objectives. We stop writing to the legacy competition_id column
  // and rely entirely on the join table going forward. Existing rows in
  // production keep their column populated for back-compat.
  const { competition_id, ...rest } = input;
  const data = assertSupabase(
    await supabase
      .from("objectives")
      .insert({ ...rest, created_by: user?.id })
      .select()
      .single()
  )!;

  // If a competition was specified, create the link row.
  if (competition_id) {
    const { error: linkErr } = await supabase
      .from("objective_competitions")
      .upsert(
        { objective_id: data.id, competition_id },
        { onConflict: "objective_id,competition_id", ignoreDuplicates: true },
      );
    if (linkErr) {
      // Best-effort cleanup: roll back the objective row we just created so
      // we don't leave orphans. Errors here are surfaced to the caller.
      await supabase.from("objectives").delete().eq("id", data.id);
      throw new Error(`Lien compétition échoué : ${linkErr.message}`);
    }
  }

  return {
    ...(data as Objective),
    competition_ids: competition_id ? [competition_id] : [],
  };
}

export async function updateObjective(id: string, input: Partial<ObjectiveInput>): Promise<Objective> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  // Note: competition_id is no longer updated via this path. Use
  // linkObjectiveToCompetition / unlinkObjectiveFromCompetition instead.
  const { competition_id: _ignored, ...rest } = input;
  void _ignored;
  const data = assertSupabase(
    await supabase
      .from("objectives")
      .update(rest)
      .eq("id", id)
      .select()
      .single()
  );
  return data as Objective;
}

export async function deleteObjective(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  assertSupabase(
    await supabase
      .from("objectives")
      .delete()
      .eq("id", id)
  );
}

/** Returns objectives count keyed by numeric user_id. */
export async function getObjectivesCountsByUser(): Promise<Record<number, number>> {
  if (!canUseSupabase()) return {};
  const data = assertSupabase(await supabase.rpc("get_objectives_counts_by_user"));
  const record: Record<number, number> = {};
  for (const row of data ?? []) {
    record[row.user_id] = Number(row.objectives_count);
  }
  return record;
}

export async function getObjectivesByCompetition(competitionId: string): Promise<Objective[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase
      .from("objective_competitions")
      .select("objective_id, objectives(*)")
      .eq("competition_id", competitionId)
  );
  return (data ?? [])
    .map((row: any) => row.objectives)
    .filter(Boolean)
    .map((row: any) => ({
      id: row.id,
      athlete_id: row.athlete_id,
      competition_id: row.competition_id,
      competition_ids: [], // Not joined here; consumers needing the full link list should call getObjectives.
      event_code: row.event_code,
      pool_length: row.pool_length,
      target_time_seconds: row.target_time_seconds != null ? Number(row.target_time_seconds) : null,
      text: row.text,
      created_by: row.created_by,
      created_at: row.created_at,
    })) as Objective[];
}

/**
 * Lien idempotent entre un objectif et une compétition (join table).
 * INSERT ... ON CONFLICT DO NOTHING.
 */
export async function linkObjectiveToCompetition(
  objectiveId: string,
  competitionId: string,
): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  assertSupabase(
    await supabase
      .from("objective_competitions")
      .upsert({ objective_id: objectiveId, competition_id: competitionId }, {
        onConflict: "objective_id,competition_id",
        ignoreDuplicates: true,
      })
  );
}

/**
 * Délie un objectif d'une compétition donnée. No-op si pas lié.
 */
export async function unlinkObjectiveFromCompetition(
  objectiveId: string,
  competitionId: string,
): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  assertSupabase(
    await supabase
      .from("objective_competitions")
      .delete()
      .eq("objective_id", objectiveId)
      .eq("competition_id", competitionId)
  );
}
