/**
 * API Swim Filières — CRUD for swim training filières
 */
import { supabase, canUseSupabase } from "./client";
import type { SwimFiliere, SwimFiliereInput } from "./types";

const EDITABLE_COLUMNS = [
  "description",
  "examples",
  "heart_rate",
  "lactate",
  "effort",
  "duration",
  "distance",
  "reps",
  "intensity",
  "recovery",
  "work_type",
  "level_intensity",
  "level_duration",
  "level_recovery",
  "level_lactate",
] as const;

type EditableColumn = (typeof EDITABLE_COLUMNS)[number];

export async function getSwimFilieres(): Promise<SwimFiliere[]> {
  if (!canUseSupabase()) return [];
  const { data, error } = await supabase
    .from("swim_filieres")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as SwimFiliere[];
}

export async function updateSwimFiliere(input: SwimFiliereInput): Promise<SwimFiliere> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const patch: Record<string, string | number | null> = {};
  for (const key of EDITABLE_COLUMNS) {
    if (key in input) patch[key] = input[key as EditableColumn] ?? null;
  }
  const { data, error } = await supabase
    .from("swim_filieres")
    .update(patch)
    .eq("id", input.id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as SwimFiliere;
}

export async function resetSwimFiliere(id: string): Promise<SwimFiliere> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const patch: Record<string, null> = {};
  for (const key of EDITABLE_COLUMNS) patch[key] = null;
  const { data, error } = await supabase
    .from("swim_filieres")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as SwimFiliere;
}
