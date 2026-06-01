import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestedParticipants } from "./suggestParticipants.ts";

test("returns matched liveffn user ids not yet assigned", () => {
  assert.deepEqual(suggestedParticipants([7, 9, 12], [9]).sort((a,b)=>a-b), [7, 12]);
});
test("ignores nulls (unmatched startlist lines) and de-dupes", () => {
  assert.deepEqual(suggestedParticipants([7, null, 7, 9], [9]), [7]);
});
test("empty when every matched swimmer is already assigned", () => {
  assert.deepEqual(suggestedParticipants([7, 9], [7, 9]), []);
});
