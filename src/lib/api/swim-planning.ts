/**
 * API Swim Planning — CRUD for swim_planning_slots
 */
import { supabase, canUseSupabase, assertSupabase } from "./client";
import type {
  SwimPlanningSlot,
  SwimPlanningSlotInput,
  SwimPlanningSlotOverride,
  SwimPlanningSlotOverrideInput,
  SwimPlanningWeekMeta,
  SwimPlanningWeekMetaInput,
  SwimPlanningWeekOverride,
  SwimPlanningWeekOverrideInput,
} from "./types";

export async function getSwimPlanningSlots(opts: {
  groupId: number;
  weekStarts: string[];
}): Promise<SwimPlanningSlot[]> {
  if (!canUseSupabase() || opts.weekStarts.length === 0) return [];
  const data = assertSupabase(
    await supabase
      .from("swim_planning_slots")
      .select("*")
      .eq("group_id", opts.groupId)
      .in("week_start", opts.weekStarts)
      .order("week_start")
      .order("day_of_week")
      .order("time_slot")
  );
  return (data ?? []) as SwimPlanningSlot[];
}

export async function upsertSwimPlanningSlot(
  input: SwimPlanningSlotInput,
): Promise<SwimPlanningSlot> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const data = assertSupabase(
    await supabase
      .from("swim_planning_slots")
      .upsert(input, { onConflict: "group_id,week_start,day_of_week,time_slot" })
      .select()
      .single()
  );
  return data as SwimPlanningSlot;
}

export async function deleteSwimPlanningSlot(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  assertSupabase(
    await supabase
      .from("swim_planning_slots")
      .delete()
      .eq("id", id)
  );
}

// ──────────────────────────────────────────────────────────────
// Overrides (per-athlete) + group week meta
// ──────────────────────────────────────────────────────────────

// ── Slot overrides (per athlete) ──

export async function getSwimPlanningSlotOverrides(opts: {
  athleteId: number;
  weekStarts: string[];
}): Promise<SwimPlanningSlotOverride[]> {
  if (!canUseSupabase() || opts.weekStarts.length === 0) return [];
  const data = assertSupabase(
    await supabase
      .from("swim_planning_slot_overrides")
      .select("*")
      .eq("athlete_id", opts.athleteId)
      .in("week_start", opts.weekStarts)
      .order("week_start")
      .order("day_of_week")
      .order("time_slot")
  );
  return (data ?? []) as SwimPlanningSlotOverride[];
}

export async function upsertSwimPlanningSlotOverride(
  input: SwimPlanningSlotOverrideInput,
): Promise<SwimPlanningSlotOverride> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const data = assertSupabase(
    await supabase
      .from("swim_planning_slot_overrides")
      .upsert(input, {
        onConflict: "athlete_id,week_start,day_of_week,time_slot",
      })
      .select()
      .single()
  );
  return data as SwimPlanningSlotOverride;
}

export async function deleteSwimPlanningSlotOverride(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  // Use RETURNING id via .select() to detect §113-style silent no-op.
  const data = assertSupabase(
    await supabase
      .from("swim_planning_slot_overrides")
      .delete()
      .eq("id", id)
      .select("id")
  );
  if (!data || data.length === 0) {
    throw new Error("Override not found or not allowed to delete");
  }
}

// ── Week meta (group-level) ──

export async function getSwimPlanningWeekMeta(opts: {
  groupId: number;
  weekStarts: string[];
}): Promise<SwimPlanningWeekMeta[]> {
  if (!canUseSupabase() || opts.weekStarts.length === 0) return [];
  const data = assertSupabase(
    await supabase
      .from("swim_planning_week_meta")
      .select("*")
      .eq("group_id", opts.groupId)
      .in("week_start", opts.weekStarts)
  );
  return (data ?? []) as SwimPlanningWeekMeta[];
}

export async function upsertSwimPlanningWeekMeta(
  input: SwimPlanningWeekMetaInput,
): Promise<SwimPlanningWeekMeta> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const data = assertSupabase(
    await supabase
      .from("swim_planning_week_meta")
      .upsert(
        { ...input, updated_at: new Date().toISOString() },
        { onConflict: "group_id,week_start" },
      )
      .select()
      .single()
  );
  return data as SwimPlanningWeekMeta;
}

// ── Week overrides (per athlete) ──

export async function getSwimPlanningWeekOverrides(opts: {
  athleteId: number;
  weekStarts: string[];
}): Promise<SwimPlanningWeekOverride[]> {
  if (!canUseSupabase() || opts.weekStarts.length === 0) return [];
  const data = assertSupabase(
    await supabase
      .from("swim_planning_week_overrides")
      .select("*")
      .eq("athlete_id", opts.athleteId)
      .in("week_start", opts.weekStarts)
  );
  return (data ?? []) as SwimPlanningWeekOverride[];
}

export async function upsertSwimPlanningWeekOverride(
  input: SwimPlanningWeekOverrideInput,
): Promise<SwimPlanningWeekOverride> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const data = assertSupabase(
    await supabase
      .from("swim_planning_week_overrides")
      .upsert(
        { ...input, updated_at: new Date().toISOString() },
        { onConflict: "athlete_id,week_start" },
      )
      .select()
      .single()
  );
  return data as SwimPlanningWeekOverride;
}
