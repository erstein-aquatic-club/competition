/**
 * Pure display helpers for the coach training-slot timeline :
 * classifies slots, maps completion state from a `SlotInstance`, and
 * formats the assigned-volume chip value.
 * Extracted from CoachTrainingSlotsScreen.tsx (§168).
 */

import type { SlotInstance } from "@/hooks/useSlotCalendar";

/**
 * UI completion state visible on the timeline and in the completion badge.
 * Structurally identical to `SlotState` in `useSlotCalendar`, kept as its
 * own alias so the UI layer owns the naming without importing the hook.
 */
export type SlotCompletionState = "empty" | "draft" | "published" | "cancelled";

/**
 * True if a slot is a swimming session (vs PPG / muscu). Defaults to `swim`
 * when `session_type` is absent or null to preserve legacy rows.
 */
export function isSwimSlot(slot: {
  session_type?: "swim" | "strength" | null;
}): boolean {
  return (slot.session_type ?? "swim") === "swim";
}

/**
 * Projects a `SlotInstance` to its completion state. Returns `"empty"` when
 * `instance` is `undefined` (an absent instance on a Monday–Sunday grid means
 * "no session yet for that day").
 */
export function getSlotCompletionState(
  instance?: SlotInstance,
): SlotCompletionState {
  if (!instance) return "empty";
  return instance.state;
}

/**
 * Splits a distance in meters into a French-locale km value + unit, or
 * `null` if the distance is 0 or negative (nothing to display).
 *
 * Rounding : nearest 100 m, rendered with one decimal (`2.5 km`), with the
 * decimal separator swapped to comma for fr-FR.
 */
export function formatAssignedKmParts(
  distanceMeters: number,
): { value: string; unit: string } | null {
  if (!distanceMeters || distanceMeters <= 0) return null;
  const km = Math.round(distanceMeters / 100) / 10;
  const value = Number.isInteger(km)
    ? `${km}`
    : km.toString().replace(".", ",");
  return { value, unit: "km" };
}
