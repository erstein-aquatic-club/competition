import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCoachHash, parseCoachHashLocation } from "@/pages/coach/coachRouteState";

test("parseCoachHashLocation reads comms deep links", () => {
  const route = parseCoachHashLocation("#/coach?section=comms&tab=sms&athleteId=42");

  assert.equal(route.section, "comms");
  assert.equal(route.tab, "sms");
  assert.equal(route.athleteId, 42);
});

test("parseCoachHashLocation falls back safely on invalid query params", () => {
  const route = parseCoachHashLocation("#/coach?section=oops&tab=bad&athleteId=NaN");

  assert.equal(route.section, "home");
  assert.equal(route.tab, undefined);
  assert.equal(route.athleteId, null);
});

test("buildCoachHash preserves comms context in URL", () => {
  const hash = buildCoachHash(
    { section: "comms", tab: "notifications", athleteId: 7 },
    "#/coach?section=comms&tab=sms&athleteId=5",
  );

  assert.equal(hash, "#/coach?section=comms&tab=notifications&athleteId=7");
});

test("buildCoachHash removes comms-only params when leaving the section", () => {
  const hash = buildCoachHash(
    { section: "swimmers" },
    "#/coach?section=comms&tab=sms&athleteId=5",
  );

  assert.equal(hash, "#/coach?section=swimmers");
});

test("buildCoachHash creates the competitions section hash used by coach screens", () => {
  const hash = buildCoachHash(
    { section: "competitions" },
    "#/coach?section=week",
  );

  assert.equal(hash, "#/coach?section=competitions");
});
