/**
 * API Swimmer Slots — Per-swimmer custom training schedule
 */

import { supabase, canUseSupabase, assertSupabase } from "./client";
import type { SwimmerTrainingSlot, SwimmerTrainingSlotInput } from "./types";

// ── GET swimmer's custom slots ──────────────────────────────

export async function getSwimmerSlots(userId: number): Promise<SwimmerTrainingSlot[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase
      .from("swimmer_training_slots")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("day_of_week")
      .order("start_time")
  );
  return (data ?? []) as SwimmerTrainingSlot[];
}

// ── CHECK if swimmer has custom slots ───────────────────────

export async function hasCustomSlots(userId: number): Promise<boolean> {
  if (!canUseSupabase()) return false;
  const { count, error } = await supabase
    .from("swimmer_training_slots")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

// ── INIT swimmer slots from group assignments ───────────────

export async function initSwimmerSlots(
  userId: number,
  groupId: number,
  createdBy: number,
): Promise<SwimmerTrainingSlot[]> {
  if (!canUseSupabase()) throw new Error("Supabase not available");

  // Fetch group's training slots with assignments
  const { data: assignments, error: assignErr } = await supabase
    .from("training_slot_assignments")
    .select("id, slot_id, training_slots!inner(day_of_week, start_time, end_time, location, session_type, is_active)")
    .eq("group_id", groupId);
  if (assignErr) throw new Error(assignErr.message);

  const rows = (assignments ?? [])
    .filter((a: any) => a.training_slots?.is_active)
    .map((a: any) => ({
      user_id: userId,
      source_assignment_id: a.id,
      day_of_week: a.training_slots.day_of_week,
      start_time: a.training_slots.start_time,
      end_time: a.training_slots.end_time,
      location: a.training_slots.location,
      session_type: a.training_slots.session_type ?? "swim",
      created_by: createdBy,
    }));

  if (rows.length === 0) return [];

  const { error: insertErr } = await supabase
    .from("swimmer_training_slots")
    .insert(rows);
  if (insertErr) throw new Error(insertErr.message);

  return getSwimmerSlots(userId);
}

// ── CREATE a single custom slot ─────────────────────────────

export async function createSwimmerSlot(
  input: SwimmerTrainingSlotInput,
  createdBy: number,
): Promise<SwimmerTrainingSlot> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const data = assertSupabase(
    await supabase
      .from("swimmer_training_slots")
      .insert({
        user_id: input.user_id,
        source_assignment_id: input.source_assignment_id ?? null,
        day_of_week: input.day_of_week,
        start_time: input.start_time,
        end_time: input.end_time,
        location: input.location,
        session_type: input.session_type,
        created_by: createdBy,
      })
      .select()
      .single()
  );
  return data as SwimmerTrainingSlot;
}

// ── UPDATE a swimmer slot ───────────────────────────────────

export async function updateSwimmerSlot(
  slotId: string,
  input: Partial<Pick<SwimmerTrainingSlotInput, "day_of_week" | "start_time" | "end_time" | "location" | "session_type">>,
): Promise<SwimmerTrainingSlot> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const data = assertSupabase(
    await supabase
      .from("swimmer_training_slots")
      .update(input)
      .eq("id", slotId)
      .select()
      .single()
  );
  return data as SwimmerTrainingSlot;
}

// ── DELETE (soft) a swimmer slot ────────────────────────────

export async function deleteSwimmerSlot(slotId: string): Promise<void> {
  if (!canUseSupabase()) return;
  assertSupabase(
    await supabase
      .from("swimmer_training_slots")
      .update({ is_active: false })
      .eq("id", slotId)
  );
}

// ── RESET swimmer slots (delete all + re-init from group) ───

export async function resetSwimmerSlots(
  userId: number,
  groupId: number,
  createdBy: number,
): Promise<SwimmerTrainingSlot[]> {
  if (!canUseSupabase()) throw new Error("Supabase not available");

  // Soft-delete all existing custom slots
  const { error: delErr } = await supabase
    .from("swimmer_training_slots")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("is_active", true);
  if (delErr) throw new Error(delErr.message);

  // Re-init from group
  return initSwimmerSlots(userId, groupId, createdBy);
}

// ── GET swimmers affected by a group slot assignment ────────

export async function getSwimmersAffectedBySlot(
  assignmentId: string,
): Promise<Array<{ user_id: number; slot_id: string }>> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase
      .from("swimmer_training_slots")
      .select("user_id, id")
      .eq("source_assignment_id", assignmentId)
      .eq("is_active", true)
  );
  return (data ?? []).map((d: any) => ({ user_id: d.user_id, slot_id: d.id }));
}
