/**
 * API Strength Planning — CRUD for strength_planning_slots
 * Mirror of swim-planning.ts — Phase 2 §157
 */
import { supabase, canUseSupabase, assertSupabase } from "./client";
import type {
  StrengthPlanningSlot,
  StrengthPlanningSlotInput,
  StrengthPlanningSlotOverride,
  StrengthPlanningSlotOverrideInput,
  StrengthPlanningWeekMeta,
  StrengthPlanningWeekMetaInput,
  StrengthPlanningWeekOverride,
  StrengthPlanningWeekOverrideInput,
} from "./types";

export async function getStrengthPlanningSlots(opts: {
  groupId: number;
  weekStarts: string[];
}): Promise<StrengthPlanningSlot[]> {
  if (!canUseSupabase() || opts.weekStarts.length === 0) return [];
  const data = assertSupabase(
    await supabase
      .from("strength_planning_slots")
      .select("*")
      .eq("group_id", opts.groupId)
      .in("week_start", opts.weekStarts)
      .order("week_start")
      .order("day_of_week")
      .order("time_slot")
  );
  return (data ?? []) as StrengthPlanningSlot[];
}

export async function upsertStrengthPlanningSlot(
  input: StrengthPlanningSlotInput,
): Promise<StrengthPlanningSlot> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const data = assertSupabase(
    await supabase
      .from("strength_planning_slots")
      .upsert(input, { onConflict: "group_id,week_start,day_of_week,time_slot" })
      .select()
      .single()
  );
  return data as StrengthPlanningSlot;
}

export async function deleteStrengthPlanningSlot(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  assertSupabase(
    await supabase
      .from("strength_planning_slots")
      .delete()
      .eq("id", id)
  );
}

// ──────────────────────────────────────────────────────────────
// Overrides (per-athlete) + group week meta
// ──────────────────────────────────────────────────────────────

// ── Slot overrides (per athlete) ──

export async function getStrengthPlanningSlotOverrides(opts: {
  athleteId: number;
  weekStarts: string[];
}): Promise<StrengthPlanningSlotOverride[]> {
  if (!canUseSupabase() || opts.weekStarts.length === 0) return [];
  const data = assertSupabase(
    await supabase
      .from("strength_planning_slot_overrides")
      .select("*")
      .eq("athlete_id", opts.athleteId)
      .in("week_start", opts.weekStarts)
      .order("week_start")
      .order("day_of_week")
      .order("time_slot")
  );
  return (data ?? []) as StrengthPlanningSlotOverride[];
}

export async function upsertStrengthPlanningSlotOverride(
  input: StrengthPlanningSlotOverrideInput,
): Promise<StrengthPlanningSlotOverride> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const data = assertSupabase(
    await supabase
      .from("strength_planning_slot_overrides")
      .upsert(input, {
        onConflict: "athlete_id,week_start,day_of_week,time_slot",
      })
      .select()
      .single()
  );
  return data as StrengthPlanningSlotOverride;
}

export async function deleteStrengthPlanningSlotOverride(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  // Use RETURNING id via .select() to detect §113-style silent no-op.
  const data = assertSupabase(
    await supabase
      .from("strength_planning_slot_overrides")
      .delete()
      .eq("id", id)
      .select("id")
  );
  if (!data || data.length === 0) {
    throw new Error("Override not found or not allowed to delete");
  }
}

// ── Week meta (group-level) ──

export async function getStrengthPlanningWeekMeta(opts: {
  groupId: number;
  weekStarts: string[];
}): Promise<StrengthPlanningWeekMeta[]> {
  if (!canUseSupabase() || opts.weekStarts.length === 0) return [];
  const data = assertSupabase(
    await supabase
      .from("strength_planning_week_meta")
      .select("*")
      .eq("group_id", opts.groupId)
      .in("week_start", opts.weekStarts)
  );
  return (data ?? []) as StrengthPlanningWeekMeta[];
}

export async function upsertStrengthPlanningWeekMeta(
  input: StrengthPlanningWeekMetaInput,
): Promise<StrengthPlanningWeekMeta> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const data = assertSupabase(
    await supabase
      .from("strength_planning_week_meta")
      .upsert(
        { ...input, updated_at: new Date().toISOString() },
        { onConflict: "group_id,week_start" },
      )
      .select()
      .single()
  );
  return data as StrengthPlanningWeekMeta;
}

// ── Week overrides (per athlete) ──

export async function getStrengthPlanningWeekOverrides(opts: {
  athleteId: number;
  weekStarts: string[];
}): Promise<StrengthPlanningWeekOverride[]> {
  if (!canUseSupabase() || opts.weekStarts.length === 0) return [];
  const data = assertSupabase(
    await supabase
      .from("strength_planning_week_overrides")
      .select("*")
      .eq("athlete_id", opts.athleteId)
      .in("week_start", opts.weekStarts)
  );
  return (data ?? []) as StrengthPlanningWeekOverride[];
}

export async function upsertStrengthPlanningWeekOverride(
  input: StrengthPlanningWeekOverrideInput,
): Promise<StrengthPlanningWeekOverride> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const data = assertSupabase(
    await supabase
      .from("strength_planning_week_overrides")
      .upsert(
        { ...input, updated_at: new Date().toISOString() },
        { onConflict: "athlete_id,week_start" },
      )
      .select()
      .single()
  );
  return data as StrengthPlanningWeekOverride;
}
