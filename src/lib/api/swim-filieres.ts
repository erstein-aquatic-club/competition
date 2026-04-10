/**
 * API Swim Filières — CRUD for swim training filières
 */
import { supabase, canUseSupabase } from "./client";
import type { SwimFiliere, SwimFiliereInput } from "./types";

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
  const { data, error } = await supabase
    .from("swim_filieres")
    .update({ description: input.description, examples: input.examples })
    .eq("id", input.id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as SwimFiliere;
}
