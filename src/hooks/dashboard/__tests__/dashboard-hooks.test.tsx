import { describe, it, expect } from "vitest";
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
    expect(toISODate(new Date(2026, 0, 3))).toBe("2026-01-03");
  });

  it("weekdayMondayIndex makes Monday index 0 and Sunday index 6", () => {
    // 2026-04-13 is a Monday
    expect(weekdayMondayIndex(new Date(2026, 3, 13))).toBe(0);
    // 2026-04-19 is a Sunday
    expect(weekdayMondayIndex(new Date(2026, 3, 19))).toBe(6);
  });

  it("metersToKm + fmtKm round-trip", () => {
    expect(metersToKm(5000)).toBe(5);
    expect(fmtKm(5)).toBe("5");
    expect(fmtKm("not-a-number")).toBe("—");
  });

  it("assignmentIso extracts a date-like field", () => {
    expect(assignmentIso({ assigned_date: "2026-04-13T10:00:00" })).toBe("2026-04-13");
    expect(assignmentIso({})).toBeNull();
  });

  it("pickAssignmentSlotKey resolves AM/PM from common shapes", () => {
    expect(pickAssignmentSlotKey({ assigned_slot: "morning" }, 0)).toBe("AM");
    expect(pickAssignmentSlotKey({ assigned_slot: "evening" }, 0)).toBe("PM");
    expect(pickAssignmentSlotKey({}, 0)).toBe("AM");
    expect(pickAssignmentSlotKey({}, 1)).toBe("PM");
  });

  it("assignmentPlannedKm sums items with repetitions", () => {
    const a = {
      items: [
        { distance: 100, raw_payload: { exercise_repetitions: 4, block_repetitions: 2 } },
        { distance: 50, raw_payload: { exercise_repetitions: 2 } },
      ],
    };
    // (100 * 4 * 2) + (50 * 2 * 1) = 900 m → 0.9 km
    expect(assignmentPlannedKm(a)).toBe(0.9);
  });

  it("assignmentPlannedStrokes groups distances by stroke code", () => {
    const items = [
      { distance: 100, raw_payload: { exercise_stroke: "crawl" } },
      { distance: 200, raw_payload: { exercise_stroke: "dos" } },
      { distance: 50, raw_payload: { exercise_stroke: "4n", exercise_repetitions: 2 } },
    ];
    const strokes = assignmentPlannedStrokes(items);
    expect(strokes).toEqual({ NL: 100, DOS: 200, BR: 0, PAP: 0, QN: 100 });
  });

  it("initPresenceDefaults seeds 7 weekdays with AM+PM true", () => {
    const presence = initPresenceDefaults();
    expect(Object.keys(presence)).toHaveLength(7);
    expect(presence[0]).toEqual({ AM: true, PM: true });
  });
});

// Minimal structural smoke test for sub-hook modules: they should export
// a function with the expected name. Guards against accidental rename/removal.
describe("dashboard sub-hook modules export the expected functions", () => {
  it("exports useDashboardSessions", async () => {
    const mod = await import("../useDashboardSessions");
    expect(typeof mod.useDashboardSessions).toBe("function");
  });
  it("exports useCompletionStatus", async () => {
    const mod = await import("../useCompletionStatus");
    expect(typeof mod.useCompletionStatus).toBe("function");
  });
  it("exports useDayMetrics", async () => {
    const mod = await import("../useDayMetrics");
    expect(typeof mod.useDayMetrics).toBe("function");
  });
  it("exports useFeedbackDraft", async () => {
    const mod = await import("../useFeedbackDraft");
    expect(typeof mod.useFeedbackDraft).toBe("function");
  });
});
