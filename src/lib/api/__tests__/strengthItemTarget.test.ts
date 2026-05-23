import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeStrengthItem } from "@/lib/api/client";
import { prepareStrengthItemsPayload } from "@/lib/api/transformers";

describe("strength item — target_intensity (§298)", () => {
  it("normalizeStrengthItem lit target_intensity depuis le DB", () => {
    const item = normalizeStrengthItem({ exercise_id: 8, ordre: 0, sets: 4, reps: 5, target_intensity: 60 }, 0, "normal");
    assert.equal(item.target_intensity, 60);
  });
  it("normalizeStrengthItem → null si absent", () => {
    const item = normalizeStrengthItem({ exercise_id: 1, ordre: 0, sets: 4, reps: 5 }, 0, "normal");
    assert.equal(item.target_intensity ?? null, null);
  });
  it("prepareStrengthItemsPayload propage target_intensity dans le payload", () => {
    const { itemsPayload } = prepareStrengthItemsPayload({
      cycle: "normal",
      items: [{ exercise_id: 8, order_index: 0, sets: 4, reps: 5, target_intensity: 60 }],
    });
    assert.equal(itemsPayload[0].target_intensity, 60);
  });
});
