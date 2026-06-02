import { test } from "node:test";
import assert from "node:assert/strict";

import {
  slotDate,
  periodDays,
  derivePeriodWeekStarts,
  computeAttendance,
  type AttendancePlannedSlot,
  type AttendanceRun,
  type ComputeAttendanceInput,
} from "../attendance.ts";

// --- slotDate ---
test("slotDate: Monday + 0 = same day", () => {
  assert.equal(slotDate("2026-06-01", 0), "2026-06-01");
});
test("slotDate: Monday + 1 = Tuesday", () => {
  assert.equal(slotDate("2026-06-01", 1), "2026-06-02");
});
test("slotDate: Monday + 6 = Sunday", () => {
  assert.equal(slotDate("2026-06-01", 6), "2026-06-07");
});

// --- periodDays ---
test("periodDays: two weeks = 14 days in order", () => {
  const days = periodDays(["2026-06-01", "2026-06-08"]);
  assert.equal(days.length, 14);
  assert.equal(days[0], "2026-06-01");
  assert.equal(days[13], "2026-06-14");
});

// --- derivePeriodWeekStarts ---
test("derivePeriodWeekStarts: 2 weeks, offset 0", () => {
  assert.deepEqual(derivePeriodWeekStarts("2026-06-08", 2, 0), [
    "2026-06-01",
    "2026-06-08",
  ]);
});
test("derivePeriodWeekStarts: 2 weeks, offset -1", () => {
  assert.deepEqual(derivePeriodWeekStarts("2026-06-08", 2, -1), [
    "2026-05-18",
    "2026-05-25",
  ]);
});
test("derivePeriodWeekStarts: 1 week, offset 0", () => {
  assert.deepEqual(derivePeriodWeekStarts("2026-06-08", 1, 0), ["2026-06-08"]);
});

// --- computeAttendance helpers ---
const baseInput: Omit<ComputeAttendanceInput, "plannedSlots" | "runs"> = {
  athleteIds: [1],
  periodWeekStarts: ["2026-06-01"],
  today: "2026-06-10",
};
const slot = (dow: number, tpl: number | null = 100): AttendancePlannedSlot => ({
  athleteId: 1,
  weekStart: "2026-06-01",
  dayOfWeek: dow,
  sessionTemplateId: tpl,
});
const run = (
  date: string,
  status: AttendanceRun["status"],
  sessionId: number | null = 100,
): AttendanceRun => ({
  athleteId: 1,
  sessionId,
  status,
  startedAt: date + "T07:00:00Z",
  completedAt: status === "completed" ? date + "T08:00:00Z" : null,
});

test("computeAttendance 1: all 3 planned all completed = 100%", () => {
  const res = computeAttendance({
    ...baseInput,
    plannedSlots: [slot(0), slot(2), slot(4)],
    runs: [run("2026-06-01", "completed"), run("2026-06-03", "completed"), run("2026-06-05", "completed")],
  });
  assert.equal(res[0].weeks[0].planned, 3);
  assert.equal(res[0].weeks[0].completed, 3);
  assert.equal(res[0].weeks[0].pct, 100);
});

test("computeAttendance 2: decalage Mon->Tue still 100%, day shifted", () => {
  const res = computeAttendance({
    ...baseInput,
    plannedSlots: [slot(0)],
    runs: [run("2026-06-02", "completed")],
  });
  assert.equal(res[0].weeks[0].pct, 100);
  const day = res[0].days.find((d) => d.date === "2026-06-01");
  assert.equal(day?.status, "shifted");
});

test("computeAttendance 3: missed not recovered = 50%, day todo", () => {
  const res = computeAttendance({
    ...baseInput,
    plannedSlots: [slot(0), slot(2)],
    runs: [run("2026-06-02", "completed")],
  });
  assert.equal(res[0].weeks[0].completed, 1);
  assert.equal(res[0].weeks[0].pct, 50);
  const day = res[0].days.find((d) => d.date === "2026-06-03");
  assert.equal(day?.status, "todo");
});

test("computeAttendance 4: started doesn't count, day started", () => {
  const res = computeAttendance({
    ...baseInput,
    plannedSlots: [slot(0)],
    runs: [run("2026-06-01", "in_progress")],
  });
  assert.equal(res[0].weeks[0].completed, 0);
  assert.equal(res[0].weeks[0].pct, 0);
  const day = res[0].days.find((d) => d.date === "2026-06-01");
  assert.equal(day?.status, "started");
});

test("computeAttendance 5: completed capped at planned", () => {
  const res = computeAttendance({
    ...baseInput,
    plannedSlots: [slot(0)],
    runs: [run("2026-06-01", "completed"), run("2026-06-03", "completed")],
  });
  assert.equal(res[0].weeks[0].completed, 1);
  assert.equal(res[0].weeks[0].pct, 100);
});

test("computeAttendance 6: non-meso run ignored", () => {
  const res = computeAttendance({
    ...baseInput,
    plannedSlots: [slot(0, 100)],
    runs: [run("2026-06-01", "completed", 999)],
  });
  assert.equal(res[0].weeks[0].completed, 0);
});

test("computeAttendance 7: future planned day = planned", () => {
  const res = computeAttendance({
    ...baseInput,
    today: "2026-06-01",
    plannedSlots: [slot(2)],
    runs: [],
  });
  const day = res[0].days.find((d) => d.date === "2026-06-03");
  assert.equal(day?.status, "planned");
});

test("computeAttendance 8: empty athlete", () => {
  const res = computeAttendance({
    ...baseInput,
    plannedSlots: [],
    runs: [],
  });
  assert.equal(res.length, 1);
  assert.equal(res[0].weeks[0].planned, 0);
  assert.equal(res[0].weeks[0].pct, null);
});
