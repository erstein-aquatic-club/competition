import { supabase, canUseSupabase, assertSupabase } from "./client";

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
  const data = assertSupabase(
    await supabase
      .from("coach_manual_swimmers")
      .select("*")
      .order("created_at", { ascending: false })
  );
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
  const data = assertSupabase(
    await supabase
      .from("coach_manual_swimmers")
      .insert({
        coach_id: user.id,
        display_name: trimmed,
        birthdate: opts?.birthdate ?? null,
        sex: opts?.sex ?? null,
      })
      .select()
      .single()
  );
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
  const data = assertSupabase(
    await supabase
      .from("coach_manual_swimmers")
      .update(updates)
      .eq("id", id)
      .select()
      .single()
  );
  return data as CoachManualSwimmer;
}

export async function deleteManualSwimmer(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  assertSupabase(
    await supabase
      .from("coach_manual_swimmers")
      .delete()
      .eq("id", id)
  );
}

/**
 * Returns manual swimmers for a SPECIFIC coach (cross-coach lookup).
 * Utilise la RPC SECURITY DEFINER `list_manual_swimmers_for_coach`
 * qui joint via auth.users.raw_app_meta_data->>'app_user_id'.
 * Coach ID = bigint (users.id), pas l'auth uuid.
 */
export async function listManualSwimmersForCoach(coachIdApp: number): Promise<CoachManualSwimmer[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase
      .rpc("list_manual_swimmers_for_coach", { p_coach_id: coachIdApp })
  );
  return (data ?? []) as CoachManualSwimmer[];
}
