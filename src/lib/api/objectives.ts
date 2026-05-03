/**
 * API Objectives - CRUD for coach objective management
 */

import { supabase, canUseSupabase } from "./client";
import type { Objective, ObjectiveInput } from "./types";

export async function getObjectives(athleteId?: string): Promise<Objective[]> {
  if (!canUseSupabase()) return [];
  let query = supabase
    .from("objectives")
    .select("*, competitions(name, date)")
    .order("created_at", { ascending: false });
  if (athleteId) {
    query = query.eq("athlete_id", athleteId);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    athlete_id: row.athlete_id,
    competition_id: row.competition_id,
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
  if (!user) return [];
  return getObjectives(user.id);
}

export async function createObjective(input: ObjectiveInput): Promise<Objective> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("objectives")
    .insert({ ...input, created_by: user?.id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Objective;
}

export async function updateObjective(id: string, input: Partial<ObjectiveInput>): Promise<Objective> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data, error } = await supabase
    .from("objectives")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Objective;
}

export async function deleteObjective(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { error } = await supabase
    .from("objectives")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Returns objectives count keyed by numeric user_id. */
export async function getObjectivesCountsByUser(): Promise<Map<number, number>> {
  if (!canUseSupabase()) return new Map();
  const { data, error } = await supabase.rpc("get_objectives_counts_by_user");
  if (error) throw new Error(error.message);
  const map = new Map<number, number>();
  for (const row of data ?? []) {
    map.set(row.user_id, Number(row.objectives_count));
  }
  return map;
}

export async function getObjectivesByCompetition(competitionId: string): Promise<Objective[]> {
  if (!canUseSupabase()) return [];
  const { data, error } = await supabase
    .from("objectives")
    .select("*")
    .eq("competition_id", competitionId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    athlete_id: row.athlete_id,
    competition_id: row.competition_id,
    event_code: row.event_code,
    pool_length: row.pool_length,
    target_time_seconds: row.target_time_seconds != null ? Number(row.target_time_seconds) : null,
    text: row.text,
    created_by: row.created_by,
    created_at: row.created_at,
  })) as Objective[];
}
