/**
 * useSlotCalendar — Materializes recurring training slots into weekly date instances
 *
 * Pure helpers (getMondayOfWeek, computeSlotState, materializeSlots) are exported
 * for unit testing. The React hook useSlotCalendar orchestrates queries + memoization.
 */

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTrainingSlots } from "@/lib/api/training-slots";
import { getSlotOverrides } from "@/lib/api/training-slots";
import { getSlotAssignments } from "@/lib/api/assignments";
import type {
  TrainingSlot,
  TrainingSlotAssignment,
  TrainingSlotOverride,
} from "@/lib/api/types";

// ── Types ────────────────────────────────────────────────────

export type SlotState = "empty" | "draft" | "published" | "cancelled";
export type SlotScheduleBucket = "morning" | "evening";

/** A single slot-linked assignment row returned by getSlotAssignments */
export type SlotAssignment = {
  id: number;
  swim_catalog_id: number | null;
  training_slot_id: string | null;
  target_group_id: number | null;
  scheduled_date: string;
  scheduled_slot: string | null;
  visible_from: string | null;
  notified_at: string | null;
  status: string;
  session_name: string | null;
  session_distance: number | null;
};

/** A materialized slot instance for a specific date */
export type SlotInstance = {
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  /** The recurring slot definition */
  slot: TrainingSlot;
  /** Groups assigned to this slot */
  groups: TrainingSlotAssignment[];
  /** Current state of this instance */
  state: SlotState;
  /** The session assignment for this slot+date, if any */
  assignment?: SlotAssignment;
  /** The override for this slot+date, if any */
  override?: TrainingSlotOverride;
};

// ── Pure helpers ─────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Get the ISO date string of the Monday for the week at `offset` from the current week.
 * offset=0 means current week, +1 next week, -1 previous week.
 */
export function getMondayOfWeek(offset: number): string {
  const now = new Date();
  // getDay(): 0=Sunday, 1=Monday, ..., 6=Saturday
  // We need Monday-based: shift so Monday=0
  const dayOfWeek = now.getDay(); // 0-6
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // days to subtract to get to Monday
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() + mondayOffset + offset * 7);
  return toISODate(monday);
}

/**
 * Compute the state of a slot instance based on its assignment and today's date.
 */
export function computeSlotState(
  assignment: SlotAssignment | undefined,
  todayIso: string,
): SlotState {
  if (!assignment) return "empty";
  if (assignment.visible_from === null || assignment.visible_from === undefined) {
    return "published";
  }
  return assignment.visible_from <= todayIso ? "published" : "draft";
}

/**
 * Convert a day_of_week (0=Monday) + mondayIso into a concrete ISO date.
 */
function dayOfWeekToDate(dayOfWeek: number, mondayIso: string): string {
  const [y, m, d] = mondayIso.split("-").map(Number);
  const monday = new Date(y, m - 1, d);
  const target = new Date(monday);
  const normalizedOffset =
    dayOfWeek >= 1 && dayOfWeek <= 7 ? dayOfWeek - 1 : dayOfWeek;
  target.setDate(monday.getDate() + normalizedOffset);
  return toISODate(target);
}

export function getSlotScheduleBucket(
  startTime: string,
): SlotScheduleBucket | null {
  const hour = parseInt(startTime.split(":")[0] ?? "", 10);
  if (!Number.isFinite(hour)) return null;
  if (hour < 13) return "morning";
  return "evening";
}

export function resolveSlotAssignment(
  slot: TrainingSlot,
  scheduledDate: string,
  assignments: SlotAssignment[],
): SlotAssignment | undefined {
  const groupIds = slot.assignments.map((assignment) => assignment.group_id);

  const directMatches = assignments.filter(
    (assignment) =>
      assignment.training_slot_id === slot.id &&
      assignment.scheduled_date === scheduledDate,
  );
  const directGroupMatch =
    groupIds.length > 0
      ? directMatches.find(
          (assignment) =>
            assignment.target_group_id != null &&
            groupIds.includes(assignment.target_group_id),
        )
      : undefined;
  if (directGroupMatch) return directGroupMatch;
  if (directMatches.length > 0) return directMatches[0];

  const bucket = getSlotScheduleBucket(slot.start_time);
  if (!bucket) return undefined;

  const fallbackMatches = assignments.filter(
    (assignment) =>
      assignment.scheduled_date === scheduledDate &&
      assignment.training_slot_id == null &&
      assignment.scheduled_slot === bucket,
  );

  const fallbackGroupMatch =
    groupIds.length > 0
      ? fallbackMatches.find(
          (assignment) =>
            assignment.target_group_id != null &&
            groupIds.includes(assignment.target_group_id),
        )
      : undefined;
  if (fallbackGroupMatch) return fallbackGroupMatch;

  const unscopedFallback = fallbackMatches.find(
    (assignment) => assignment.target_group_id == null,
  );
  if (unscopedFallback) return unscopedFallback;

  if (groupIds.length === 0 && fallbackMatches.length === 1) {
    return fallbackMatches[0];
  }

  return undefined;
}

/**
 * Materialize recurring slots into concrete SlotInstance[] for one week.
 * @param slots      Active training slots with their group assignments
 * @param assignments Slot-linked session assignments for the date range
 * @param overrides   Slot overrides (cancellations/modifications)
 * @param mondayIso   ISO date of the Monday of the target week
 */
export function materializeSlots(
  slots: TrainingSlot[],
  assignments: SlotAssignment[],
  overrides: TrainingSlotOverride[],
  mondayIso: string,
): SlotInstance[] {
  const todayIso = toISODate(new Date());

  // Build override lookup: "slot_id:date" -> override
  const overrideMap = new Map<string, TrainingSlotOverride>();
  for (const o of overrides) {
    overrideMap.set(`${o.slot_id}:${o.override_date}`, o);
  }

  const instances: SlotInstance[] = [];

  for (const slot of slots) {
    const date = dayOfWeekToDate(slot.day_of_week, mondayIso);
    const overrideKey = `${slot.id}:${date}`;
    const override = overrideMap.get(overrideKey);
    const assignment = resolveSlotAssignment(slot, date, assignments);

    let state: SlotState;
    if (override?.status === "cancelled") {
      state = "cancelled";
    } else {
      state = computeSlotState(assignment, todayIso);
    }

    instances.push({
      date,
      slot,
      groups: slot.assignments,
      state,
      assignment,
      override,
    });
  }

  // Sort by date, then start_time
  instances.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.slot.start_time.localeCompare(b.slot.start_time);
  });

  return instances;
}

// ── React Hook ───────────────────────────────────────────────

function getSundayIso(mondayIso: string): string {
  const [y, m, d] = mondayIso.split("-").map(Number);
  const monday = new Date(y, m - 1, d);
  monday.setDate(monday.getDate() + 6);
  return toISODate(monday);
}

function buildWeekDates(mondayIso: string): string[] {
  const [y, m, d] = mondayIso.split("-").map(Number);
  const monday = new Date(y, m - 1, d);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    dates.push(toISODate(day));
  }
  return dates;
}

export function useSlotCalendar() {
  const [weekOffset, setWeekOffset] = useState(0);

  const mondayIso = useMemo(() => getMondayOfWeek(weekOffset), [weekOffset]);
  const sundayIso = useMemo(() => getSundayIso(mondayIso), [mondayIso]);
  const weekDates = useMemo(() => buildWeekDates(mondayIso), [mondayIso]);

  // Query 1: All active training slots (with group assignments)
  const {
    data: slots = [],
    isLoading: slotsLoading,
  } = useQuery({
    queryKey: ["training-slots"],
    queryFn: () => getTrainingSlots(),
    staleTime: 5 * 60 * 1000, // 5 min
  });

  // Query 2: Slot-linked assignments for the week
  const {
    data: assignments = [],
    isLoading: assignmentsLoading,
  } = useQuery({
    queryKey: ["slot-assignments", mondayIso, sundayIso],
    queryFn: () => getSlotAssignments({ from: mondayIso, to: sundayIso }),
    staleTime: 2 * 60 * 1000, // 2 min
  });

  // Query 3: Slot overrides from the Monday onward
  const {
    data: overrides = [],
    isLoading: overridesLoading,
  } = useQuery({
    queryKey: ["slot-overrides", mondayIso],
    queryFn: () => getSlotOverrides({ fromDate: mondayIso }),
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = slotsLoading || assignmentsLoading || overridesLoading;

  // Materialize instances
  const instances = useMemo(
    () => materializeSlots(slots, assignments, overrides, mondayIso),
    [slots, assignments, overrides, mondayIso],
  );

  // Group by date
  const instancesByDate = useMemo(() => {
    const map = new Map<string, SlotInstance[]>();
    for (const inst of instances) {
      const list = map.get(inst.date) ?? [];
      list.push(inst);
      map.set(inst.date, list);
    }
    return map;
  }, [instances]);

  // Navigation
  const navigateToday = useCallback(() => setWeekOffset(0), []);
  const prevWeek = useCallback(() => setWeekOffset((o) => o - 1), []);
  const nextWeek = useCallback(() => setWeekOffset((o) => o + 1), []);

  return {
    weekOffset,
    mondayIso,
    sundayIso,
    weekDates,
    instances,
    instancesByDate,
    isLoading,
    navigateToday,
    prevWeek,
    nextWeek,
  };
}
