import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveScheduledSlot } from "../assignments";

describe("deriveScheduledSlot", () => {
  it("returns 'morning' for start_time before 13:00", () => {
    assert.equal(deriveScheduledSlot("08:00"), "morning");
    assert.equal(deriveScheduledSlot("12:59"), "morning");
  });
  it("returns 'evening' for start_time at or after 13:00", () => {
    assert.equal(deriveScheduledSlot("13:00"), "evening");
    assert.equal(deriveScheduledSlot("18:30"), "evening");
  });
});
