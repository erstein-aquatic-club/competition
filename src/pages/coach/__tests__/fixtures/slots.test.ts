import assert from "node:assert/strict";
import { test } from "node:test";

import {
  makeTrainingSlot,
  makeTrainingSlotAssignment,
  makeTrainingSlotCoach,
  makeTrainingSlotOverride,
  makeSlotAssignment,
  makeSlotInstance,
  makeSwimBlock,
} from "./slots";

test("fixture defaults yield a valid recurring swim slot on Monday 08:00-10:00", () => {
  const slot = makeTrainingSlot();
  assert.equal(slot.day_of_week, 1);
  assert.equal(slot.session_type, "swim");
  assert.equal(slot.is_active, true);
  assert.equal(slot.scheduled_date, null, "scheduled_date=null ⇒ recurring");
  assert.deepEqual(slot.assignments, []);
  assert.deepEqual(slot.coaches, []);
});

test("makeTrainingSlot overrides shallow-merge cleanly", () => {
  const slot = makeTrainingSlot({ session_type: "strength", day_of_week: 3 });
  assert.equal(slot.session_type, "strength");
  assert.equal(slot.day_of_week, 3);
  // Non-overridden field preserved
  assert.equal(slot.start_time, "08:00:00");
});

test("makeSlotInstance composes a valid slot instance with embedded slot", () => {
  const inst = makeSlotInstance();
  assert.equal(inst.state, "empty");
  assert.equal(inst.date, "2026-04-20");
  assert.equal(inst.slot.id, "slot-1");
  assert.deepEqual(inst.groups, []);
});

test("makeSlotInstance propagates slotOverrides onto the embedded slot", () => {
  const inst = makeSlotInstance({
    state: "draft",
    slotOverrides: { start_time: "14:00:00", location: "Strasbourg" },
  });
  assert.equal(inst.state, "draft");
  assert.equal(inst.slot.start_time, "14:00:00");
  assert.equal(inst.slot.location, "Strasbourg");
});

test("makeSlotAssignment defaults to an active morning assignment", () => {
  const a = makeSlotAssignment();
  assert.equal(a.status, "active");
  assert.equal(a.scheduled_slot, "morning");
  assert.equal(a.visible_from, null);
});

test("makeTrainingSlotOverride defaults to 'cancelled' status", () => {
  const o = makeTrainingSlotOverride();
  assert.equal(o.status, "cancelled");
  assert.equal(o.new_start_time, null);
});

test("makeSwimBlock produces a warmup with one NL exercise", () => {
  const b = makeSwimBlock();
  assert.equal(b.title, "Echauffement");
  assert.equal(b.exercises.length, 1);
  assert.equal(b.exercises[0].strokeType, "NL");
  assert.equal(b.exercises[0].distance, 100);
});

test("makeTrainingSlotAssignment + makeTrainingSlotCoach build minimal join rows", () => {
  const tsa = makeTrainingSlotAssignment({ group_id: 42, group_name: "Élites" });
  assert.equal(tsa.group_id, 42);
  assert.equal(tsa.group_name, "Élites");

  const tsc = makeTrainingSlotCoach({ coach_id: 7, coach_name: "Alice" });
  assert.equal(tsc.coach_id, 7);
  assert.equal(tsc.coach_name, "Alice");
});
