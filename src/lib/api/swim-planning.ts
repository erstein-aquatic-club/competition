/**
 * API Swim Planning — CRUD for swim_planning_slots
 */
import { supabase, canUseSupabase } from "./client";
import type { SwimPlanningSlot, SwimPlanningSlotInput } from "./types";

export async function getSwimPlanningSlots(opts: {
  groupId: number;
  weekStarts: string[];
}): Promise<SwimPlanningSlot[]> {
  if (!canUseSupabase() || opts.weekStarts.length === 0) return [];
  const { data, error } = await supabase
    .from("swim_planning_slots")
    .select("*")
    .eq("group_id", opts.groupId)
    .in("week_start", opts.weekStarts)
    .order("week_start")
    .order("day_of_week")
    .order("time_slot");
  if (error) throw new Error(error.message);
  return (data ?? []) as SwimPlanningSlot[];
}

export async function upsertSwimPlanningSlot(
  input: SwimPlanningSlotInput,
): Promise<SwimPlanningSlot> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data, error } = await supabase
    .from("swim_planning_slots")
    .upsert(input, { onConflict: "group_id,week_start,day_of_week,time_slot" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as SwimPlanningSlot;
}

export async function deleteSwimPlanningSlot(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { error } = await supabase
    .from("swim_planning_slots")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
