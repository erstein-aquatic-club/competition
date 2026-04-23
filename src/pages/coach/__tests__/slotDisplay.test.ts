import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isSwimSlot,
  getSlotCompletionState,
  formatAssignedKmParts,
} from "@/pages/coach/lib/slotDisplay";
import { makeSlotInstance } from "./fixtures/slots";

test("isSwimSlot treats undefined/null session_type as swim (legacy default)", () => {
  assert.equal(isSwimSlot({}), true);
  assert.equal(isSwimSlot({ session_type: null }), true);
});

test("isSwimSlot recognises explicit values", () => {
  assert.equal(isSwimSlot({ session_type: "swim" }), true);
  assert.equal(isSwimSlot({ session_type: "strength" }), false);
});

test("getSlotCompletionState returns 'empty' for absent instance", () => {
  assert.equal(getSlotCompletionState(undefined), "empty");
});

test("getSlotCompletionState propagates instance.state for each variant", () => {
  for (const state of ["empty", "draft", "published", "cancelled"] as const) {
    const instance = makeSlotInstance({ state });
    assert.equal(getSlotCompletionState(instance), state);
  }
});

test("formatAssignedKmParts returns null for zero / negative distances", () => {
  assert.equal(formatAssignedKmParts(0), null);
  assert.equal(formatAssignedKmParts(-500), null);
});

test("formatAssignedKmParts rounds to the nearest 100 m", () => {
  assert.deepEqual(formatAssignedKmParts(1_000), { value: "1", unit: "km" });
  assert.deepEqual(formatAssignedKmParts(1_500), { value: "1,5", unit: "km" });
  // 2 449 m → arrondi à 2 400 m → 2,4 km
  assert.deepEqual(formatAssignedKmParts(2_449), { value: "2,4", unit: "km" });
  // 2 450 m → arrondi supérieur à 2 500 m → 2,5 km
  assert.deepEqual(formatAssignedKmParts(2_450), { value: "2,5", unit: "km" });
});

test("formatAssignedKmParts uses French comma as decimal separator", () => {
  const parts = formatAssignedKmParts(1_700);
  assert.equal(parts?.value, "1,7");
  assert.ok(!parts?.value.includes("."));
});

test("formatAssignedKmParts omits decimal for whole kilometers", () => {
  assert.deepEqual(formatAssignedKmParts(3_000), { value: "3", unit: "km" });
});
