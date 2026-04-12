/**
 * API Training Slots - Recurring weekly training schedule management
 */

import { supabase, canUseSupabase } from "./client";
import type {
  TrainingSlot,
  TrainingSlotAssignment,
  TrainingSlotCoach,
  TrainingSlotOverride,
  TrainingSlotInput,
  TrainingSlotOverrideInput,
} from "./types";

// ── GET all active slots with assignments + coaches ────────

export async function getTrainingSlots(): Promise<TrainingSlot[]> {
  if (!canUseSupabase()) return [];

  // Fetch slots
  const { data: slots, error: slotsErr } = await supabase
    .from("training_slots")
    .select("*")
    .eq("is_active", true)
    .order("day_of_week")
    .order("start_time");
  if (slotsErr) throw new Error(slotsErr.message);
  if (!slots || slots.length === 0) return [];

  const slotIds = slots.map((s: any) => s.id);

  // Fetch group assignments (no coach join anymore)
  const { data: assignments, error: assignErr } = await supabase
    .from("training_slot_assignments")
    .select("*, groups:group_id(name)")
    .in("slot_id", slotIds);
  if (assignErr) throw new Error(assignErr.message);

  // Fetch coach assignments
  const { data: coaches, error: coachErr } = await supabase
    .from("training_slot_coaches")
    .select("*, coach:coach_id(display_name)")
    .in("slot_id", slotIds);
  if (coachErr) throw new Error(coachErr.message);

  // Build assignment lookup
  const assignmentsBySlot = new Map<string, TrainingSlotAssignment[]>();
  for (const a of assignments ?? []) {
    const mapped: TrainingSlotAssignment = {
      id: a.id,
      slot_id: a.slot_id,
      group_id: a.group_id,
      group_name: (a as any).groups?.name ?? "?",
    };
    const list = assignmentsBySlot.get(a.slot_id) ?? [];
    list.push(mapped);
    assignmentsBySlot.set(a.slot_id, list);
  }

  // Build coach lookup
  const coachesBySlot = new Map<string, TrainingSlotCoach[]>();
  for (const c of coaches ?? []) {
    const mapped: TrainingSlotCoach = {
      id: c.id,
      slot_id: c.slot_id,
      coach_id: c.coach_id,
      coach_name: (c as any).coach?.display_name ?? "?",
    };
    const list = coachesBySlot.get(c.slot_id) ?? [];
    list.push(mapped);
    coachesBySlot.set(c.slot_id, list);
  }

  return slots.map((s: any) => ({
    id: s.id,
    day_of_week: s.day_of_week,
    start_time: s.start_time,
    end_time: s.end_time,
    location: s.location,
    session_type: (s.session_type === "strength" ? "strength" : "swim") as "swim" | "strength",
    is_active: s.is_active,
    created_by: s.created_by,
    created_at: s.created_at,
    lane_count: s.lane_count ?? null,
    scheduled_date: s.scheduled_date ?? null,
    assignments: assignmentsBySlot.get(s.id) ?? [],
    coaches: coachesBySlot.get(s.id) ?? [],
  }));
}

// ── GET slots for a specific group (swimmer view) ───────────

export async function getTrainingSlotsForGroup(groupId: number): Promise<TrainingSlot[]> {
  const allSlots = await getTrainingSlots();
  return allSlots.filter((s) => s.assignments.some((a) => a.group_id === groupId));
}

// ── CREATE slot + assignments + coaches ─────────────────────

export async function createTrainingSlot(input: TrainingSlotInput): Promise<TrainingSlot> {
  if (!canUseSupabase()) throw new Error("Supabase not available");

  const { data: slot, error: slotErr } = await supabase
    .from("training_slots")
    .insert({
      day_of_week: input.day_of_week,
      start_time: input.start_time,
      end_time: input.end_time,
      location: input.location,
      session_type: input.session_type,
      lane_count: input.lane_count,
      scheduled_date: input.scheduled_date ?? null,
    })
    .select()
    .single();
  if (slotErr) throw new Error(slotErr.message);

  // Insert group assignments
  if (input.group_ids.length > 0) {
    const assignmentRows = input.group_ids.map((gid) => ({
      slot_id: slot.id,
      group_id: gid,
    }));
    const { error: assignErr } = await supabase
      .from("training_slot_assignments")
      .insert(assignmentRows);
    if (assignErr) throw new Error(assignErr.message);
  }

  // Insert coach assignments
  if (input.coach_ids.length > 0) {
    const coachRows = input.coach_ids.map((cid) => ({
      slot_id: slot.id,
      coach_id: cid,
    }));
    const { error: coachErr } = await supabase
      .from("training_slot_coaches")
      .insert(coachRows);
    if (coachErr) throw new Error(coachErr.message);
  }

  // Re-fetch to get joined names
  const allSlots = await getTrainingSlots();
  return allSlots.find((s) => s.id === slot.id)!;
}

// ── UPDATE slot + sync assignments + coaches ────────────────

export async function updateTrainingSlot(slotId: string, input: TrainingSlotInput): Promise<TrainingSlot> {
  if (!canUseSupabase()) throw new Error("Supabase not available");

  // Update slot fields
  const { error: slotErr } = await supabase
    .from("training_slots")
    .update({
      day_of_week: input.day_of_week,
      start_time: input.start_time,
      end_time: input.end_time,
      location: input.location,
      session_type: input.session_type,
      lane_count: input.lane_count,
      scheduled_date: input.scheduled_date ?? null,
    })
    .eq("id", slotId);
  if (slotErr) throw new Error(slotErr.message);

  // Replace group assignments: delete all then re-insert
  const { error: delAssignErr } = await supabase
    .from("training_slot_assignments")
    .delete()
    .eq("slot_id", slotId);
  if (delAssignErr) throw new Error(delAssignErr.message);

  if (input.group_ids.length > 0) {
    const assignmentRows = input.group_ids.map((gid) => ({
      slot_id: slotId,
      group_id: gid,
    }));
    const { error: assignErr } = await supabase
      .from("training_slot_assignments")
      .insert(assignmentRows);
    if (assignErr) throw new Error(assignErr.message);
  }

  // Replace coach assignments: delete all then re-insert
  const { error: delCoachErr } = await supabase
    .from("training_slot_coaches")
    .delete()
    .eq("slot_id", slotId);
  if (delCoachErr) throw new Error(delCoachErr.message);

  if (input.coach_ids.length > 0) {
    const coachRows = input.coach_ids.map((cid) => ({
      slot_id: slotId,
      coach_id: cid,
    }));
    const { error: coachErr } = await supabase
      .from("training_slot_coaches")
      .insert(coachRows);
    if (coachErr) throw new Error(coachErr.message);
  }

  const allSlots = await getTrainingSlots();
  return allSlots.find((s) => s.id === slotId)!;
}

// ── DELETE (soft) slot ──────────────────────────────────────

export async function deleteTrainingSlot(slotId: string): Promise<void> {
  if (!canUseSupabase()) return;
  const { error } = await supabase
    .from("training_slots")
    .update({ is_active: false })
    .eq("id", slotId);
  if (error) throw new Error(error.message);
}

// ── OVERRIDES ───────────────────────────────────────────────

export async function getSlotOverrides(options?: {
  slotId?: string;
  fromDate?: string;
}): Promise<TrainingSlotOverride[]> {
  if (!canUseSupabase()) return [];
  let query = supabase
    .from("training_slot_overrides")
    .select("*")
    .order("override_date", { ascending: true });
  if (options?.slotId) query = query.eq("slot_id", options.slotId);
  if (options?.fromDate) query = query.gte("override_date", options.fromDate);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as TrainingSlotOverride[];
}

export async function createSlotOverride(input: TrainingSlotOverrideInput): Promise<TrainingSlotOverride> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const { data, error } = await supabase
    .from("training_slot_overrides")
    .upsert(
      {
        slot_id: input.slot_id,
        override_date: input.override_date,
        status: input.status,
        new_start_time: input.new_start_time ?? null,
        new_end_time: input.new_end_time ?? null,
        new_location: input.new_location ?? null,
        reason: input.reason ?? null,
      },
      { onConflict: "slot_id,override_date" },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TrainingSlotOverride;
}

export async function deleteSlotOverride(overrideId: string): Promise<void> {
  if (!canUseSupabase()) return;
  const { error } = await supabase
    .from("training_slot_overrides")
    .delete()
    .eq("id", overrideId);
  if (error) throw new Error(error.message);
}
