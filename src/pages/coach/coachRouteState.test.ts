import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCoachHashLocation, buildCoachHash } from "./coachRouteState.ts";

test("parses competitionId only for the competitions section", () => {
  assert.equal(parseCoachHashLocation("#/coach?section=competitions&competitionId=abc").competitionId, "abc");
  assert.equal(parseCoachHashLocation("#/coach?section=home&competitionId=abc").competitionId, undefined);
});
test("round-trips competitionId in the hash", () => {
  const hash = buildCoachHash({ section: "competitions", competitionId: "abc" });
  assert.match(hash, /section=competitions/);
  assert.match(hash, /competitionId=abc/);
});
test("drops competitionId when leaving the competitions section", () => {
  const hash = buildCoachHash({ section: "home" }, "#/coach?section=competitions&competitionId=abc");
  assert.doesNotMatch(hash, /competitionId/);
});
