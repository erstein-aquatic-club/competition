import { supabase, canUseSupabase } from "./client";

export interface CoachManualSwimmer {
  id: string;
  coach_id: string;
  display_name: string;
  birthdate: string | null;
  sex: "M" | "F" | null;
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

export async function createManualSwimmer(
  displayName: string,
  opts?: { birthdate?: string | null; sex?: "M" | "F" | null },
): Promise<CoachManualSwimmer> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  const trimmed = displayName.trim();
  if (!trimmed) throw new Error("Nom requis");
  const { data, error } = await supabase
    .from("coach_manual_swimmers")
    .insert({
      coach_id: user.id,
      display_name: trimmed,
      birthdate: opts?.birthdate ?? null,
      sex: opts?.sex ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CoachManualSwimmer;
}

export async function updateManualSwimmer(
  id: string,
  patch: { displayName?: string; birthdate?: string | null; sex?: "M" | "F" | null },
): Promise<CoachManualSwimmer> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const updates: Record<string, unknown> = {};
  if (patch.displayName !== undefined) updates.display_name = patch.displayName.trim();
  if (patch.birthdate !== undefined) updates.birthdate = patch.birthdate;
  if (patch.sex !== undefined) updates.sex = patch.sex;
  const { data, error } = await supabase
    .from("coach_manual_swimmers")
    .update(updates)
    .eq("id", id)
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
