import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TIMELINE_START,
  TIMELINE_END,
  TIMELINE_HOURS,
  PX_PER_HOUR,
  TIMELINE_HEIGHT,
  HOUR_LABELS,
  formatTime,
  timeToMinutes,
  timeToPx,
  durationPx,
  durationLabel,
} from "@/pages/coach/lib/slotTiming";

test("timeline constants are self-consistent", () => {
  assert.equal(TIMELINE_START, 6);
  assert.equal(TIMELINE_END, 22);
  assert.equal(TIMELINE_HOURS, 16);
  assert.equal(PX_PER_HOUR, 40);
  assert.equal(TIMELINE_HEIGHT, 640);
  assert.equal(HOUR_LABELS.length, 17);
  assert.equal(HOUR_LABELS[0], 6);
  assert.equal(HOUR_LABELS[HOUR_LABELS.length - 1], 22);
});

test("formatTime truncates HH:MM:SS to HH:MM", () => {
  assert.equal(formatTime("08:00:00"), "08:00");
  assert.equal(formatTime("23:59:59"), "23:59");
  assert.equal(formatTime("08:00"), "08:00");
});

test("timeToMinutes handles both HH:MM and HH:MM:SS", () => {
  assert.equal(timeToMinutes("00:00"), 0);
  assert.equal(timeToMinutes("08:00"), 480);
  assert.equal(timeToMinutes("08:30"), 510);
  assert.equal(timeToMinutes("23:59"), 23 * 60 + 59);
  assert.equal(timeToMinutes("08:30:15"), 510); // seconds ignored
});

test("timeToPx pins timeline start to 0 and scales at PX_PER_HOUR", () => {
  assert.equal(timeToPx("06:00"), 0);
  assert.equal(timeToPx("07:00"), PX_PER_HOUR);
  assert.equal(timeToPx("08:00"), 2 * PX_PER_HOUR);
  assert.equal(timeToPx("06:30"), PX_PER_HOUR / 2);
  assert.equal(timeToPx("22:00"), TIMELINE_HEIGHT);
});

test("timeToPx returns negative offsets for pre-timeline times (caller must clamp)", () => {
  assert.ok(timeToPx("05:00") < 0);
});

test("durationPx is the span between two times", () => {
  assert.equal(durationPx("08:00", "10:00"), 2 * PX_PER_HOUR);
  assert.equal(durationPx("08:00", "08:00"), 0);
  assert.equal(durationPx("08:00", "09:30"), 1.5 * PX_PER_HOUR);
});

test("durationLabel formats hours-only, minutes-only, and combined", () => {
  assert.equal(durationLabel("08:00", "10:00"), "2h");
  assert.equal(durationLabel("08:00", "08:45"), "45min");
  assert.equal(durationLabel("08:00", "09:30"), "1h30");
  assert.equal(durationLabel("08:00", "09:05"), "1h05");
  assert.equal(durationLabel("08:00", "08:00"), "0min");
});
