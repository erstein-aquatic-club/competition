/**
 * API Planning - CRUD for training cycles (macro) and weeks (micro)
 */

import { supabase, canUseSupabase, assertSupabase } from "./client";
import type { TrainingCycle, TrainingCycleInput, TrainingWeek, TrainingWeekInput } from "./types";

// ── Cycles ──

export async function getTrainingCycles(opts?: {
  athleteId?: number;
  groupId?: number;
}): Promise<TrainingCycle[]> {
  if (!canUseSupabase()) return [];
  let query = supabase
    .from("training_cycles")
    .select("*, start_comp:competitions!start_competition_id(name, date), end_comp:competitions!end_competition_id(name, date)")
    .order("created_at", { ascending: false }) as any;
  if (opts?.athleteId) query = query.eq("athlete_id", opts.athleteId);
  if (opts?.groupId) query = query.eq("group_id", opts.groupId);
  const data = assertSupabase(await query) as any[] | null;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    group_id: row.group_id,
    athlete_id: row.athlete_id,
    start_competition_id: row.start_competition_id,
    end_competition_id: row.end_competition_id,
    start_date: row.start_date,
    name: row.name,
    notes: row.notes,
    created_by: row.created_by,
    created_at: row.created_at,
    start_competition_name: row.start_comp?.name ?? null,
    start_competition_date: row.start_comp?.date ?? null,
    end_competition_name: row.end_comp?.name ?? null,
    end_competition_date: row.end_comp?.date ?? null,
  }));
}

export async function createTrainingCycle(input: TrainingCycleInput): Promise<TrainingCycle> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data: { user } } = await supabase.auth.getUser();
  const data = assertSupabase(
    await supabase
      .from("training_cycles")
      .insert({ ...input, created_by: user?.id })
      .select()
      .single()
  );
  return data as TrainingCycle;
}

export async function updateTrainingCycle(id: string, input: Partial<TrainingCycleInput>): Promise<TrainingCycle> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const data = assertSupabase(
    await supabase
      .from("training_cycles")
      .update(input)
      .eq("id", id)
      .select()
      .single()
  );
  return data as TrainingCycle;
}

export async function deleteTrainingCycle(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  assertSupabase(
    await supabase
      .from("training_cycles")
      .delete()
      .eq("id", id)
  );
}

// ── Weeks ──

export async function getTrainingWeeks(cycleId: string): Promise<TrainingWeek[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase
      .from("training_weeks")
      .select("*")
      .eq("cycle_id", cycleId)
      .order("week_start", { ascending: true })
  );
  return (data ?? []) as TrainingWeek[];
}

export async function upsertTrainingWeek(input: TrainingWeekInput): Promise<TrainingWeek> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const data = assertSupabase(
    await supabase
      .from("training_weeks")
      .upsert(input, { onConflict: "cycle_id,week_start" })
      .select()
      .single()
  );
  return data as TrainingWeek;
}

export async function bulkUpsertTrainingWeeks(weeks: TrainingWeekInput[]): Promise<TrainingWeek[]> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  if (weeks.length === 0) return [];
  const data = assertSupabase(
    await supabase
      .from("training_weeks")
      .upsert(weeks, { onConflict: "cycle_id,week_start" })
      .select()
  );
  return (data ?? []) as TrainingWeek[];
}

export async function deleteTrainingWeek(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  assertSupabase(
    await supabase
      .from("training_weeks")
      .delete()
      .eq("id", id)
  );
}
