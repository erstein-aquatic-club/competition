import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getTimelineEventEndDate,
  isTimelineEventPast,
} from "@/pages/coach/competitionTimeline";

test("isTimelineEventPast keeps an ongoing multi-day competition out of past items", () => {
  const competition = {
    date: "2026-04-17",
    end_date: "2026-04-19",
  };

  assert.equal(getTimelineEventEndDate(competition), "2026-04-19");
  assert.equal(isTimelineEventPast(competition, "2026-04-18"), false);
});

test("isTimelineEventPast marks a competition as past only after its end date", () => {
  const competition = {
    date: "2026-04-17",
    end_date: "2026-04-18",
  };

  assert.equal(isTimelineEventPast(competition, "2026-04-18"), false);
  assert.equal(isTimelineEventPast(competition, "2026-04-19"), true);
});

test("getTimelineEventEndDate falls back to the start date for single-day events", () => {
  const interview = {
    date: "2026-04-18",
  };

  assert.equal(getTimelineEventEndDate(interview), "2026-04-18");
  assert.equal(isTimelineEventPast(interview, "2026-04-18"), false);
  assert.equal(isTimelineEventPast(interview, "2026-04-19"), true);
});
