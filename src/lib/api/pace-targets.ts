import { supabase, canUseSupabase } from "./client";
import type { Stroke } from "../paceCalculator";

export interface PaceTarget {
  id: string;
  coach_id: string;
  swimmer_account_id: number | null;
  swimmer_manual_id: string | null;
  stroke: Stroke;
  target_distance_m: number;
  target_time_ms: number;
  updated_at: string;
}

export type SwimmerRef =
  | { kind: "account"; accountId: number }
  | { kind: "manual"; manualId: string };

export async function listMyPaceTargets(): Promise<PaceTarget[]> {
  if (!canUseSupabase()) return [];
  const { data, error } = await supabase
    .from("coach_pace_targets")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PaceTarget[];
}

export async function upsertPaceTarget(args: {
  swimmer: SwimmerRef;
  stroke: Stroke;
  target_distance_m: number;
  target_time_ms: number;
}): Promise<PaceTarget> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { swimmer, stroke, target_distance_m, target_time_ms } = args;
  const isAccount = swimmer.kind === "account";

  const row = {
    coach_id: user.id,
    swimmer_account_id: isAccount ? swimmer.accountId : null,
    swimmer_manual_id: !isAccount ? swimmer.manualId : null,
    stroke,
    target_distance_m,
    target_time_ms,
    updated_at: new Date().toISOString(),
  };

  const conflictIndex = isAccount ? "uq_pace_targets_account" : "uq_pace_targets_manual";

  const { data, error } = await supabase
    .from("coach_pace_targets")
    .upsert(row, { onConflict: conflictIndex })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as PaceTarget;
}

export async function deletePaceTarget(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { error } = await supabase
    .from("coach_pace_targets")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
