import { supabase, canUseSupabase } from "./client";

export interface CoachManualSwimmer {
  id: string;
  coach_id: string;
  display_name: string;
  created_at: string;
}

export async function listManualSwimmers(): Promise<CoachManualSwimmer[]> {
  if (!canUseSupabase()) return [];
  const { data, error } = await supabase
    .from("coach_manual_swimmers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CoachManualSwimmer[];
}

export async function createManualSwimmer(displayName: string): Promise<CoachManualSwimmer> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  const trimmed = displayName.trim();
  if (!trimmed) throw new Error("Nom requis");
  const { data, error } = await supabase
    .from("coach_manual_swimmers")
    .insert({ coach_id: user.id, display_name: trimmed })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CoachManualSwimmer;
}

export async function deleteManualSwimmer(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { error } = await supabase
    .from("coach_manual_swimmers")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
