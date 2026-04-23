import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DAYS_FR,
  DAYS_SHORT,
  getMonday,
  getISOWeek,
  formatDayMonth,
  toIsoDate,
  diffDaysInclusive,
  iterateDatesInclusive,
} from "@/pages/coach/lib/weekDates";

test("DAYS_FR and DAYS_SHORT align on 7 entries, Monday-first", () => {
  assert.equal(DAYS_FR.length, 7);
  assert.equal(DAYS_SHORT.length, 7);
  assert.equal(DAYS_FR[0], "Lundi");
  assert.equal(DAYS_SHORT[0], "Lun");
  assert.equal(DAYS_FR[6], "Dimanche");
  assert.equal(DAYS_SHORT[6], "Dim");
});

test("getMonday returns Monday of the week for any weekday", () => {
  // 2026-04-23 = Thursday
  const thu = new Date(2026, 3, 23);
  const mon = getMonday(thu);
  assert.equal(mon.getDay(), 1);
  assert.equal(toIsoDate(mon), "2026-04-20");
});

test("getMonday wraps backward correctly from Sunday", () => {
  // 2026-04-26 = Sunday → Monday should be 2026-04-20
  const sun = new Date(2026, 3, 26);
  assert.equal(toIsoDate(getMonday(sun)), "2026-04-20");
});

test("getMonday is idempotent when given a Monday", () => {
  const mon = new Date(2026, 3, 20); // Monday
  assert.equal(toIsoDate(getMonday(mon)), "2026-04-20");
});

test("getMonday zeroes the time fields (00:00:00.000 local)", () => {
  const noon = new Date(2026, 3, 23, 14, 37, 42, 500);
  const mon = getMonday(noon);
  assert.equal(mon.getHours(), 0);
  assert.equal(mon.getMinutes(), 0);
  assert.equal(mon.getSeconds(), 0);
  assert.equal(mon.getMilliseconds(), 0);
});

test("getISOWeek returns the ISO 8601 week number", () => {
  // 2026-01-01 = Thursday → ISO week 1
  assert.equal(getISOWeek(new Date(2026, 0, 1)), 1);
  // 2026-04-23 = Thursday of ISO week 17
  assert.equal(getISOWeek(new Date(2026, 3, 23)), 17);
  // 2025-12-29 = Monday of ISO week 1 of 2026
  assert.equal(getISOWeek(new Date(2025, 11, 29)), 1);
  // 2020-12-31 = Thursday of ISO week 53
  assert.equal(getISOWeek(new Date(2020, 11, 31)), 53);
});

test("formatDayMonth renders DD/MM in fr-FR", () => {
  assert.equal(formatDayMonth(new Date(2026, 3, 23)), "23/04");
  assert.equal(formatDayMonth(new Date(2026, 0, 1)), "01/01");
});

test("toIsoDate uses local timezone, zero-pads correctly", () => {
  assert.equal(toIsoDate(new Date(2026, 0, 1)), "2026-01-01");
  assert.equal(toIsoDate(new Date(2026, 11, 31)), "2026-12-31");
});

test("diffDaysInclusive counts both endpoints", () => {
  assert.equal(diffDaysInclusive("2026-04-20", "2026-04-20"), 1);
  assert.equal(diffDaysInclusive("2026-04-20", "2026-04-21"), 2);
  assert.equal(diffDaysInclusive("2026-04-20", "2026-04-26"), 7);
});

test("diffDaysInclusive survives month and year boundaries", () => {
  assert.equal(diffDaysInclusive("2026-01-30", "2026-02-02"), 4);
  assert.equal(diffDaysInclusive("2025-12-30", "2026-01-02"), 4);
});

test("iterateDatesInclusive lists every day in the range", () => {
  const dates = iterateDatesInclusive("2026-04-20", "2026-04-22");
  assert.deepEqual(dates, ["2026-04-20", "2026-04-21", "2026-04-22"]);
});

test("iterateDatesInclusive returns a single day when start === end", () => {
  assert.deepEqual(iterateDatesInclusive("2026-04-20", "2026-04-20"), [
    "2026-04-20",
  ]);
});

test("iterateDatesInclusive returns empty when end < start", () => {
  assert.deepEqual(iterateDatesInclusive("2026-04-22", "2026-04-20"), []);
});

test("iterateDatesInclusive crosses a DST boundary without drift (spring 2026)", () => {
  // DST in France starts 2026-03-29 (Sun, +1h at 02:00 → 03:00)
  const dates = iterateDatesInclusive("2026-03-28", "2026-03-30");
  assert.deepEqual(dates, ["2026-03-28", "2026-03-29", "2026-03-30"]);
});
