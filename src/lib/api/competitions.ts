/**
 * API Competitions - CRUD for coach competition management
 */

import { supabase, canUseSupabase, assertSupabase } from "./client";
import type { Competition, CompetitionInput, CompetitionAssignment } from "./types";

export async function getCompetitions(): Promise<Competition[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase
      .from("competitions")
      .select("*")
      .order("date", { ascending: true })
  );
  return (data ?? []) as Competition[];
}

export async function createCompetition(input: CompetitionInput): Promise<Competition> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data: { user } } = await supabase.auth.getUser();
  const data = assertSupabase(
    await supabase
      .from("competitions")
      .insert({ ...input, created_by: user?.id })
      .select()
      .single()
  );
  return data as Competition;
}

export async function updateCompetition(id: string, input: Partial<CompetitionInput>): Promise<Competition> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const data = assertSupabase(
    await supabase
      .from("competitions")
      .update(input)
      .eq("id", id)
      .select()
      .single()
  );
  return data as Competition;
}

export async function deleteCompetition(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  assertSupabase(
    await supabase
      .from("competitions")
      .delete()
      .eq("id", id)
  );
}

export async function getCompetitionAssignments(competitionId: string): Promise<CompetitionAssignment[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase
      .from("competition_assignments")
      .select("*")
      .eq("competition_id", competitionId)
  );
  return (data ?? []) as CompetitionAssignment[];
}

export async function setCompetitionAssignments(
  competitionId: string,
  athleteIds: number[],
): Promise<void> {
  if (!canUseSupabase()) return;
  // Delete all existing assignments for this competition
  const { error: delError } = await supabase
    .from("competition_assignments")
    .delete()
    .eq("competition_id", competitionId);
  if (delError) throw new Error(delError.message);
  // Insert new assignments
  if (athleteIds.length > 0) {
    const rows = athleteIds.map((athlete_id) => ({
      competition_id: competitionId,
      athlete_id,
    }));
    const { error: insError } = await supabase
      .from("competition_assignments")
      .insert(rows);
    if (insError) throw new Error(insError.message);
  }
}

export async function getMyCompetitionIds(athleteId?: number | null): Promise<string[]> {
  if (!canUseSupabase()) return [];
  let query = supabase
    .from("competition_assignments")
    .select("competition_id");
  if (athleteId) query = query.eq("athlete_id", athleteId);
  const data = assertSupabase(await query);
  return (data ?? []).map((r: any) => r.competition_id);
}
