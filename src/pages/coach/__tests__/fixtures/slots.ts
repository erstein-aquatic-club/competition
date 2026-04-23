/**
 * Canonical fixtures for coach training-slot tests (§168).
 *
 * WHY : the refactor of `CoachTrainingSlotsScreen.tsx` will move types
 * between modules. If every test inlines its own `{ id, day_of_week, ... }`
 * literal, a future shape change (new required field) breaks compilation
 * file-by-file — not atomically. These builders centralise the shape so
 * one edit fixes every consumer.
 *
 * HOW TO USE : call a builder with an `overrides` object to tweak the
 * fields that matter for a given test :
 *
 *   const slot = makeTrainingSlot({ start_time: "10:00:00" });
 *   const instance = makeSlotInstance({ state: "draft" });
 */

import type { SlotAssignment, SlotInstance } from "@/hooks/useSlotCalendar";
import type {
  TrainingSlot,
  TrainingSlotAssignment,
  TrainingSlotCoach,
  TrainingSlotOverride,
} from "@/lib/api/types";
import type { SwimBlock } from "@/lib/swimTextParser";

export function makeTrainingSlotAssignment(
  overrides: Partial<TrainingSlotAssignment> = {},
): TrainingSlotAssignment {
  return {
    id: "tsa-1",
    slot_id: "slot-1",
    group_id: 1,
    group_name: "Groupe Test",
    ...overrides,
  };
}

export function makeTrainingSlotCoach(
  overrides: Partial<TrainingSlotCoach> = {},
): TrainingSlotCoach {
  return {
    id: "tsc-1",
    slot_id: "slot-1",
    coach_id: 1,
    coach_name: "Coach Test",
    ...overrides,
  };
}

export function makeTrainingSlot(
  overrides: Partial<TrainingSlot> = {},
): TrainingSlot {
  return {
    id: "slot-1",
    day_of_week: 1, // Monday
    start_time: "08:00:00",
    end_time: "10:00:00",
    location: "Piscine Erstein",
    session_type: "swim",
    is_active: true,
    created_by: 1,
    created_at: "2026-04-20T08:00:00.000Z",
    lane_count: null,
    scheduled_date: null,
    assignments: [],
    coaches: [],
    ...overrides,
  };
}

export function makeSlotAssignment(
  overrides: Partial<SlotAssignment> = {},
): SlotAssignment {
  return {
    id: 1,
    swim_catalog_id: null,
    training_slot_id: "slot-1",
    target_group_id: 1,
    scheduled_date: "2026-04-20",
    scheduled_slot: "morning",
    visible_from: null,
    notified_at: null,
    status: "active",
    session_name: null,
    session_distance: null,
    ...overrides,
  };
}

export function makeTrainingSlotOverride(
  overrides: Partial<TrainingSlotOverride> = {},
): TrainingSlotOverride {
  return {
    id: "tso-1",
    slot_id: "slot-1",
    override_date: "2026-04-20",
    status: "cancelled",
    new_start_time: null,
    new_end_time: null,
    new_location: null,
    reason: null,
    created_by: 1,
    created_at: "2026-04-20T08:00:00.000Z",
    ...overrides,
  };
}

/**
 * Builder for a fully-formed SlotInstance. Override `slotOverrides` to tweak
 * the embedded slot without having to rebuild it manually.
 */
export function makeSlotInstance(
  overrides: Partial<Omit<SlotInstance, "slot">> & {
    slotOverrides?: Partial<TrainingSlot>;
  } = {},
): SlotInstance {
  const { slotOverrides, ...rest } = overrides;
  return {
    date: "2026-04-20",
    slot: makeTrainingSlot(slotOverrides),
    groups: [],
    state: "empty",
    ...rest,
  };
}

export function makeSwimBlock(
  overrides: Partial<SwimBlock> = {},
): SwimBlock {
  return {
    title: "Echauffement",
    repetitions: 1,
    description: "",
    modalities: "",
    equipment: [],
    exercises: [
      {
        repetitions: 4,
        distance: 100,
        rest: null,
        restType: "rest",
        stroke: "NL",
        strokeType: "NL",
        intensity: "V1",
        modalities: "",
        equipment: [],
      },
    ],
    ...overrides,
  };
}
