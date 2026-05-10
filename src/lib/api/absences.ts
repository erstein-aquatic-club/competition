/**
 * API Absences - Planned absence management for swimmers
 */

import { supabase, canUseSupabase, assertSupabase } from "./client";
import type { PlannedAbsence } from "./types";

export async function getPlannedAbsences(options?: {
  userId?: number;
  from?: string;
  to?: string;
}): Promise<PlannedAbsence[]> {
  if (!canUseSupabase()) return [];
  let query = supabase.from("planned_absences").select("*");
  if (options?.userId) query = query.eq("user_id", options.userId);
  if (options?.from) query = query.gte("date", options.from);
  if (options?.to) query = query.lte("date", options.to);
  const data = assertSupabase(await query.order("date", { ascending: true }));
  return (data ?? []) as PlannedAbsence[];
}

export async function getMyPlannedAbsences(): Promise<PlannedAbsence[]> {
  if (!canUseSupabase()) return [];
  // RLS filters by app_user_id() automatically
  const data = assertSupabase(
    await supabase
      .from("planned_absences")
      .select("*")
      .order("date", { ascending: true })
  );
  return (data ?? []) as PlannedAbsence[];
}

export async function setPlannedAbsence(date: string, reason?: string | null): Promise<PlannedAbsence> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data: { session } } = await supabase.auth.getSession();
  const appUserId = session?.user?.app_metadata?.app_user_id;
  if (!appUserId) throw new Error("User ID not found");
  // Migration 00128 dropped the simple UNIQUE(user_id,date) constraint and replaced it
  // with an expression-based index COALESCE(scheduled_slot,'all'), which PostgREST cannot
  // reference via onConflict column names. Use DELETE+INSERT instead.
  const { error: delError } = await supabase
    .from("planned_absences")
    .delete()
    .eq("user_id", appUserId)
    .eq("date", date)
    .is("scheduled_slot", null);
  if (delError) throw new Error(delError.message);
  const data = assertSupabase(
    await supabase
      .from("planned_absences")
      .insert({ user_id: appUserId, date, reason: reason ?? null })
      .select()
      .single()
  );
  return data as PlannedAbsence;
}

export async function removePlannedAbsence(date: string): Promise<void> {
  if (!canUseSupabase()) return;
  const { data: { session } } = await supabase.auth.getSession();
  const appUserId = session?.user?.app_metadata?.app_user_id;
  if (!appUserId) return;
  assertSupabase(
    await supabase
      .from("planned_absences")
      .delete()
      .eq("user_id", appUserId)
      .eq("date", date)
  );
}
