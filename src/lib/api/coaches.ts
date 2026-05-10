/**
 * API Coaches — listing des coachs actifs (utilisé par le sélecteur de
 * coach dans la vue Allures, §186 step 2).
 */

import { supabase, canUseSupabase, assertSupabase } from "./client";

export interface CoachOption {
  id: number;
  display_name: string;
}

/**
 * Returns all active coaches (role='coach', is_active=true), sorted alphabetically.
 * Lecture autorisée à tous (policy users_select).
 */
export async function listActiveCoaches(): Promise<CoachOption[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase
      .from("users")
      .select("id, display_name")
      .eq("role", "coach")
      .eq("is_active", true)
      .order("display_name", { ascending: true })
  );
  return (data ?? []).map((u: any) => ({
    id: u.id as number,
    display_name: u.display_name as string,
  }));
}
