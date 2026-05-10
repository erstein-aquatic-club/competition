import { supabase, canUseSupabase, assertSupabase } from "./client";
import type { Stroke } from "../paceCalculator";
import type { PoolSize } from "../poolConversion";

export interface PaceTarget {
  id: string;
  coach_id: string;
  swimmer_account_id: number | null;
  swimmer_manual_id: string | null;
  stroke: Stroke;
  target_distance_m: number;
  target_time_ms: number;
  target_pool_size: PoolSize;
  updated_at: string;
}

export type SwimmerRef =
  | { kind: "account"; accountId: number }
  | { kind: "manual"; manualId: string };

export async function listMyPaceTargets(): Promise<PaceTarget[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase
      .from("coach_pace_targets")
      .select("*")
      .order("updated_at", { ascending: false })
  );
  return (data ?? []) as PaceTarget[];
}

export async function upsertPaceTarget(args: {
  swimmer: SwimmerRef;
  stroke: Stroke;
  target_distance_m: number;
  target_time_ms: number;
  target_pool_size?: PoolSize;
}): Promise<PaceTarget> {
  if (!canUseSupabase()) throw new Error("Supabase not available");

  const { swimmer, stroke, target_distance_m, target_time_ms, target_pool_size = "50m" } = args;
  const isAccount = swimmer.kind === "account";

  const data = assertSupabase(await supabase.rpc("upsert_pace_target", {
    p_stroke: stroke,
    p_distance_m: target_distance_m,
    p_time_ms: target_time_ms,
    p_pool_size: target_pool_size,
    p_swimmer_account_id: isAccount ? swimmer.accountId : null,
    p_swimmer_manual_id: !isAccount ? (swimmer as { kind: "manual"; manualId: string }).manualId : null,
  }));
  return data as PaceTarget;
}

export async function deletePaceTarget(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  assertSupabase(
    await supabase
      .from("coach_pace_targets")
      .delete()
      .eq("id", id)
  );
}
