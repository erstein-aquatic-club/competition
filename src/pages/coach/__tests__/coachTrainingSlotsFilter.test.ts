import assert from "node:assert/strict";
import { test } from "node:test";

import type { TrainingSlot } from "@/lib/api/types";
import {
  filterCoachTrainingSlots,
  getVisibleSwimmerGroupIds,
} from "@/pages/coach/coachTrainingSlotsFilter";

function makeSlot(id: string, groupIds: number[]): TrainingSlot {
  return {
    id,
    day_of_week: 1,
    start_time: "08:00:00",
    end_time: "10:00:00",
    location: "Piscine",
    session_type: "swim",
    is_active: true,
    created_by: 1,
    created_at: "2026-04-18T08:00:00.000Z",
    scheduled_date: null,
    lane_count: null,
    coaches: [],
    assignments: groupIds.map((groupId, index) => ({
      id: `${id}-${index}`,
      slot_id: id,
      group_id: groupId,
      group_name: `Groupe ${groupId}`,
    })),
  };
}

test("getVisibleSwimmerGroupIds prefers temporary memberships when one is active", () => {
  const visible = getVisibleSwimmerGroupIds({
    permanentGroupIds: [1],
    temporaryGroupIds: [10, 11],
    hasActiveTemporary: true,
  });

  assert.deepEqual(visible, [10, 11]);
});

test("filterCoachTrainingSlots keeps swimmer custom slots when they exist", () => {
  const sharedSlot = makeSlot("shared", [1]);
  const customSlot = makeSlot("custom", []);

  const result = filterCoachTrainingSlots({
    slots: [sharedSlot],
    filterValue: "swimmer:42",
    athletes: [{ id: 42, group_id: 1 }],
    swimmerFilterId: 42,
    swimmerHasCustom: true,
    swimmerSlotsAsTraining: [customSlot],
    swimmerGroupContext: {
      permanentGroupIds: [1],
      temporaryGroupIds: [],
      hasActiveTemporary: false,
    },
  });

  assert.deepEqual(result.map((slot) => slot.id), ["custom"]);
});

test("filterCoachTrainingSlots uses all visible swimmer groups for inherited slots", () => {
  const eliteSlot = makeSlot("elite", [1]);
  const subgroupSlot = makeSlot("subgroup", [11]);
  const unrelatedSlot = makeSlot("other", [99]);

  const result = filterCoachTrainingSlots({
    slots: [eliteSlot, subgroupSlot, unrelatedSlot],
    filterValue: "swimmer:42",
    athletes: [{ id: 42, group_id: 1 }],
    swimmerFilterId: 42,
    swimmerHasCustom: false,
    swimmerSlotsAsTraining: [],
    swimmerGroupContext: {
      permanentGroupIds: [1],
      temporaryGroupIds: [10, 11],
      hasActiveTemporary: true,
    },
  });

  assert.deepEqual(result.map((slot) => slot.id), ["subgroup"]);
});

test("filterCoachTrainingSlots falls back to athlete.group_id when group context is unavailable", () => {
  const eliteSlot = makeSlot("elite", [1]);
  const otherSlot = makeSlot("other", [2]);

  const result = filterCoachTrainingSlots({
    slots: [eliteSlot, otherSlot],
    filterValue: "swimmer:42",
    athletes: [{ id: 42, group_id: 1 }],
    swimmerFilterId: 42,
    swimmerHasCustom: false,
    swimmerSlotsAsTraining: [],
    swimmerGroupContext: null,
  });

  assert.deepEqual(result.map((slot) => slot.id), ["elite"]);
});
