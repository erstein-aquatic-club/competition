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

test("parseCoachHashLocation parses weekDate when section=week", () => {
  const state = parseCoachHashLocation("#/coach?section=week&weekDate=2026-04-14");
  assert.equal(state.section, "week");
  assert.equal(state.weekDate, "2026-04-14");
});

test("parseCoachHashLocation ignores weekDate when section is not week", () => {
  const state = parseCoachHashLocation("#/coach?section=swimmers&weekDate=2026-04-14");
  assert.equal(state.weekDate, undefined);
});

test("parseCoachHashLocation ignores invalid weekDate format", () => {
  const state = parseCoachHashLocation("#/coach?section=week&weekDate=not-a-date");
  assert.equal(state.weekDate, undefined);
});

test("buildCoachHash round-trips weekDate through build", () => {
  const hash = buildCoachHash({ section: "week", weekDate: "2026-04-14" });
  assert.ok(hash.includes("section=week"), "should contain section=week");
  assert.ok(hash.includes("weekDate=2026-04-14"), "should contain weekDate=2026-04-14");
});

test("buildCoachHash omits weekDate from hash when undefined", () => {
  const hash = buildCoachHash({ section: "week" });
  assert.ok(!hash.includes("weekDate"), "should not contain weekDate");
});

test("buildCoachHash strips weekDate when section changes away from week", () => {
  const hash = buildCoachHash({ section: "swimmers" }, "#/coach?section=week&weekDate=2026-04-14");
  assert.ok(!hash.includes("weekDate"), "should not contain weekDate");
});
