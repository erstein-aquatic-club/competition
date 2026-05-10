/**
 * API Timesheet - Timesheet management methods
 */

import {
  supabase,
  canUseSupabase,
  delay,
  STORAGE_KEYS,
  assertSupabase,
} from './client';
import type { TimesheetShift, TimesheetLocation, TimesheetGroupLabel } from './types';
import { localStorageGet, localStorageSave } from './localStorage';

const defaultTimesheetLocations = ["Piscine", "Compétition"];

export async function listTimesheetShifts(options?: {
  coachId?: number | null;
  from?: string;
  to?: string;
}): Promise<TimesheetShift[]> {
  if (canUseSupabase()) {
    let query = supabase
      .from("timesheet_shifts")
      .select("*")
      .order("shift_date", { ascending: false });
    if (options?.coachId) query = query.eq("coach_id", options.coachId);
    if (options?.from) query = query.gte("shift_date", options.from);
    if (options?.to) query = query.lte("shift_date", options.to);
    const data = assertSupabase(await query);
    const shifts = data ?? [];
    if (shifts.length === 0) return shifts;

    // Batch-fetch all group names for these shifts
    const shiftIds = shifts.map((s: TimesheetShift) => s.id);
    const { data: groupRows } = await supabase
      .from("timesheet_shift_groups")
      .select("shift_id, group_name")
      .in("shift_id", shiftIds);
    const groupMap = new Map<number, string[]>();
    for (const row of groupRows ?? []) {
      const list = groupMap.get(row.shift_id) ?? [];
      list.push(row.group_name);
      groupMap.set(row.shift_id, list);
    }
    return shifts.map((s: TimesheetShift) => ({
      ...s,
      group_names: groupMap.get(s.id) ?? [],
    }));
  }

  await delay(200);
  const shifts = (localStorageGet(STORAGE_KEYS.TIMESHEET_SHIFTS) || []) as TimesheetShift[];
  return shifts
    .filter((shift: TimesheetShift) => {
      if (options?.coachId && shift.coach_id !== options.coachId) return false;
      if (options?.from && shift.shift_date < options.from) return false;
      if (options?.to && shift.shift_date > options.to) return false;
      return true;
    })
    .sort((a: TimesheetShift, b: TimesheetShift) => {
      if (a.shift_date !== b.shift_date) {
        return a.shift_date < b.shift_date ? 1 : -1;
      }
      return a.start_time < b.start_time ? 1 : -1;
    });
}

export async function listTimesheetLocations(): Promise<TimesheetLocation[]> {
  if (canUseSupabase()) {
    const data = assertSupabase(
      await supabase
        .from("timesheet_locations")
        .select("*")
        .order("name")
    );
    return data ?? [];
  }

  await delay(120);
  const stored = localStorageGet(STORAGE_KEYS.TIMESHEET_LOCATIONS);
  if (Array.isArray(stored) && stored.length) {
    return stored as TimesheetLocation[];
  }
  const now = new Date().toISOString();
  const seeded = defaultTimesheetLocations.map((name, index) => ({
    id: index + 1,
    name,
    created_at: now,
    updated_at: now,
  }));
  localStorageSave(STORAGE_KEYS.TIMESHEET_LOCATIONS, seeded);
  return seeded;
}

export async function createTimesheetLocation(payload: { name: string }) {
  if (canUseSupabase()) {
    assertSupabase(
      await supabase
        .from("timesheet_locations")
        .insert({ name: payload.name.trim() })
    );
    return { status: "created" };
  }

  await delay(120);
  const trimmed = payload.name.trim();
  if (!trimmed) {
    throw new Error("Missing location name");
  }
  const stored = localStorageGet(STORAGE_KEYS.TIMESHEET_LOCATIONS);
  const seedTimestamp = new Date().toISOString();
  const locations = Array.isArray(stored) && stored.length
    ? (stored as TimesheetLocation[])
    : defaultTimesheetLocations.map((name, index) => ({
        id: index + 1,
        name,
        created_at: seedTimestamp,
        updated_at: seedTimestamp,
      }));
  const exists = locations.some(
    (item: TimesheetLocation) => item.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (exists) {
    return { status: "exists" };
  }
  const now = new Date().toISOString();
  const created = { id: Date.now(), name: trimmed, created_at: now, updated_at: now };
  localStorageSave(STORAGE_KEYS.TIMESHEET_LOCATIONS, [...locations, created]);
  return { status: "created" };
}

export async function deleteTimesheetLocation(payload: { id: number }) {
  if (canUseSupabase()) {
    assertSupabase(
      await supabase
        .from("timesheet_locations")
        .delete()
        .eq("id", payload.id)
    );
    return { status: "deleted" };
  }

  await delay(120);
  const locations = (localStorageGet(STORAGE_KEYS.TIMESHEET_LOCATIONS) || []) as TimesheetLocation[];
  const updated = locations.filter((item) => item.id !== payload.id);
  localStorageSave(STORAGE_KEYS.TIMESHEET_LOCATIONS, updated);
  return { status: "deleted" };
}

export async function listTimesheetCoaches(): Promise<
  { id: number; display_name: string }[]
> {
  if (canUseSupabase()) {
    const data = assertSupabase(
      await supabase
        .from("users")
        .select("id, display_name")
        .eq("role", "coach")
        .eq("is_active", true)
    );
    return (data ?? []).map((u: any) => ({ id: u.id, display_name: u.display_name }));
  }
  return [];
}

export async function createTimesheetShift(
  payload: Omit<TimesheetShift, "id" | "created_at" | "updated_at" | "coach_name">,
) {
  if (canUseSupabase()) {
    const data = assertSupabase(await supabase.from("timesheet_shifts").insert({
      coach_id: payload.coach_id,
      shift_date: payload.shift_date,
      start_time: payload.start_time,
      end_time: payload.end_time ?? null,
      location: payload.location ?? null,
      is_travel: payload.is_travel,
    }).select("id").single())!;
    if (payload.group_names?.length) {
      await setShiftGroupNames(data.id, payload.group_names);
    }
    return { status: "created" };
  }

  await delay(200);
  const shifts = (localStorageGet(STORAGE_KEYS.TIMESHEET_SHIFTS) || []) as any[];
  const created = { ...payload, id: Date.now(), created_at: new Date().toISOString() };
  localStorageSave(STORAGE_KEYS.TIMESHEET_SHIFTS, [...shifts, created]);
  return { status: "created" };
}

export async function updateTimesheetShift(
  payload: Partial<TimesheetShift> & { id: number },
) {
  if (canUseSupabase()) {
    const { id, group_names, ...rest } = payload;
    assertSupabase(await supabase.from("timesheet_shifts").update(rest).eq("id", id));
    if (group_names !== undefined) {
      await setShiftGroupNames(id, group_names ?? []);
    }
    return { status: "updated" };
  }

  await delay(200);
  const shifts = (localStorageGet(STORAGE_KEYS.TIMESHEET_SHIFTS) || []) as TimesheetShift[];
  const index = shifts.findIndex((shift: TimesheetShift) => shift.id === payload.id);
  if (index === -1) return { status: "missing" };
  const updated = [...shifts];
  updated[index] = { ...updated[index], ...payload, updated_at: new Date().toISOString() };
  localStorageSave(STORAGE_KEYS.TIMESHEET_SHIFTS, updated);
  return { status: "updated" };
}

export async function deleteTimesheetShift(payload: { id: number }) {
  if (canUseSupabase()) {
    assertSupabase(
      await supabase
        .from("timesheet_shifts")
        .delete()
        .eq("id", payload.id)
    );
    return { status: "deleted" };
  }

  await delay(200);
  const shifts = (localStorageGet(STORAGE_KEYS.TIMESHEET_SHIFTS) || []) as TimesheetShift[];
  const updated = shifts.filter((shift: TimesheetShift) => shift.id !== payload.id);
  localStorageSave(STORAGE_KEYS.TIMESHEET_SHIFTS, updated);
  return { status: "deleted" };
}

// ─── Timesheet Group Labels ─────────────────────────────────────────────────

export async function listTimesheetGroupLabels(): Promise<TimesheetGroupLabel[]> {
  if (canUseSupabase()) {
    const data = assertSupabase(
      await supabase
        .from("timesheet_group_labels")
        .select("*")
        .order("name")
    );
    return data ?? [];
  }
  await delay(120);
  return (localStorageGet("timesheet_group_labels") || []) as TimesheetGroupLabel[];
}

export async function createTimesheetGroupLabel(payload: { name: string }) {
  if (canUseSupabase()) {
    assertSupabase(
      await supabase
        .from("timesheet_group_labels")
        .insert({ name: payload.name.trim() })
    );
    return { status: "created" };
  }
  await delay(120);
  const trimmed = payload.name.trim();
  if (!trimmed) throw new Error("Missing label name");
  const stored = (localStorageGet("timesheet_group_labels") || []) as TimesheetGroupLabel[];
  const exists = stored.some((l) => l.name.toLowerCase() === trimmed.toLowerCase());
  if (exists) return { status: "exists" };
  const created = { id: Date.now(), name: trimmed, created_at: new Date().toISOString() };
  localStorageSave("timesheet_group_labels", [...stored, created]);
  return { status: "created" };
}

export async function deleteTimesheetGroupLabel(payload: { id: number }) {
  if (canUseSupabase()) {
    assertSupabase(
      await supabase
        .from("timesheet_group_labels")
        .delete()
        .eq("id", payload.id)
    );
    return { status: "deleted" };
  }
  await delay(120);
  const stored = (localStorageGet("timesheet_group_labels") || []) as TimesheetGroupLabel[];
  localStorageSave("timesheet_group_labels", stored.filter((l) => l.id !== payload.id));
  return { status: "deleted" };
}

// ─── Timesheet Shift Groups (M:N) ──────────────────────────────────────────

export async function getShiftGroupNames(shiftId: number): Promise<string[]> {
  if (canUseSupabase()) {
    const data = assertSupabase(
      await supabase
        .from("timesheet_shift_groups")
        .select("group_name")
        .eq("shift_id", shiftId)
    );
    return (data ?? []).map((r: { group_name: string }) => r.group_name);
  }
  return [];
}

export async function setShiftGroupNames(shiftId: number, groupNames: string[]) {
  if (canUseSupabase()) {
    const { error: delError } = await supabase
      .from("timesheet_shift_groups")
      .delete()
      .eq("shift_id", shiftId);
    if (delError) throw new Error(delError.message);

    if (groupNames.length > 0) {
      const rows = groupNames.map((name) => ({ shift_id: shiftId, group_name: name }));
      const { error: insError } = await supabase
        .from("timesheet_shift_groups")
        .insert(rows);
      if (insError) throw new Error(insError.message);
    }
    return { status: "updated" };
  }
  return { status: "noop" };
}

// ─── Permanent Groups for Timesheet ─────────────────────────────────────────

export async function listPermanentGroupsForTimesheet(): Promise<{ id: number; name: string }[]> {
  if (canUseSupabase()) {
    const data = assertSupabase(
      await supabase
        .from("groups")
        .select("id, name")
        .eq("is_temporary", false)
        .eq("is_active", true)
        .order("name")
    );
    return data ?? [];
  }
  return [];
}
