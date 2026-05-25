import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assignmentIso,
  assignmentPlannedKm,
  assignmentPlannedStrokes,
  fmtKm,
  initPresenceDefaults,
  metersToKm,
  pickAssignmentSlotKey,
  toISODate,
  weekdayMondayIndex,
} from "../internal";

// These tests exercise the pure logic consumed by the four dashboard
// sub-hooks. Rendering the hooks themselves requires a DOM environment
// which this project does not configure (no jsdom/happy-dom), so we lock
// the extracted helpers — which is where the actual behaviour lives.

describe("dashboard/internal helpers", () => {
  it("toISODate pads month and day", () => {
    assert.equal(toISODate(new Date(2026, 0, 3)), "2026-01-03");
  });

  it("weekdayMondayIndex makes Monday index 0 and Sunday index 6", () => {
    // 2026-04-13 is a Monday
    assert.equal(weekdayMondayIndex(new Date(2026, 3, 13)), 0);
    // 2026-04-19 is a Sunday
    assert.equal(weekdayMondayIndex(new Date(2026, 3, 19)), 6);
  });

  it("metersToKm + fmtKm round-trip", () => {
    assert.equal(metersToKm(5000), 5);
    assert.equal(fmtKm(5), "5");
    assert.equal(fmtKm("not-a-number"), "—");
  });

  it("assignmentIso extracts a date-like field", () => {
    assert.equal(assignmentIso({ assigned_date: "2026-04-13T10:00:00" }), "2026-04-13");
    assert.equal(assignmentIso({}), null);
  });

  it("pickAssignmentSlotKey resolves AM/PM from common shapes", () => {
    assert.equal(pickAssignmentSlotKey({ assigned_slot: "morning" }, 0), "AM");
    assert.equal(pickAssignmentSlotKey({ assigned_slot: "evening" }, 0), "PM");
    assert.equal(pickAssignmentSlotKey({}, 0), "AM");
    assert.equal(pickAssignmentSlotKey({}, 1), "PM");
  });

  it("assignmentPlannedKm sums items with repetitions", () => {
    const a = {
      items: [
        { distance: 100, raw_payload: { exercise_repetitions: 4, block_repetitions: 2 } },
        { distance: 50, raw_payload: { exercise_repetitions: 2 } },
      ],
    };
    // (100 * 4 * 2) + (50 * 2 * 1) = 900 m → 0.9 km
    assert.equal(assignmentPlannedKm(a), 0.9);
  });

  it("assignmentPlannedStrokes groups distances by stroke code", () => {
    const items = [
      { distance: 100, raw_payload: { exercise_stroke: "crawl" } },
      { distance: 200, raw_payload: { exercise_stroke: "dos" } },
      { distance: 50, raw_payload: { exercise_stroke: "4n", exercise_repetitions: 2 } },
    ];
    const strokes = assignmentPlannedStrokes(items);
    assert.deepEqual(strokes, { NL: 100, DOS: 200, BR: 0, PAP: 0, QN: 100 });
  });

  it("initPresenceDefaults seeds 7 weekdays with AM+PM true", () => {
    const presence = initPresenceDefaults();
    assert.equal((Object.keys(presence)).length, 7);
    assert.deepEqual(presence[0], { AM: true, PM: true });
  });
});

// Minimal structural smoke test for sub-hook modules: they should export
// a function with the expected name. Guards against accidental rename/removal.
describe("dashboard sub-hook modules export the expected functions", () => {
  it("exports useDashboardSessions", async () => {
    const mod = await import("../useDashboardSessions");
    assert.equal(typeof mod.useDashboardSessions, "function");
  });
  it("exports useCompletionStatus", async () => {
    const mod = await import("../useCompletionStatus");
    assert.equal(typeof mod.useCompletionStatus, "function");
  });
  it("exports useDayMetrics", async () => {
    const mod = await import("../useDayMetrics");
    assert.equal(typeof mod.useDayMetrics, "function");
  });
  it("exports useFeedbackDraft", async () => {
    const mod = await import("../useFeedbackDraft");
    assert.equal(typeof mod.useFeedbackDraft, "function");
  });
});
