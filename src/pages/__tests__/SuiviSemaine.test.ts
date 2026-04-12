import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeIndicatorValue,
  findStrengthRunForSlot,
  formatLocalDateISO,
  formatClockTime,
  formatSlotTime,
  getStrengthRunDifficulty,
  getStrengthRunIndicatorValue,
  inferSessionKind,
} from "@/pages/SuiviSemaine";

test("formatClockTime and formatSlotTime use h format without seconds", () => {
  assert.equal(formatClockTime("18:00:00"), "18h00");
  assert.equal(formatClockTime("8:5"), "08h05");
  assert.equal(formatSlotTime("18:00:00-20:15:00"), "18h00 - 20h15");
});

test("inferSessionKind prefers assignment type and falls back to slot location", () => {
  assert.equal(inferSessionKind({ assignmentType: "swim", location: "Salle" }), "swim");
  assert.equal(inferSessionKind({ location: "Salle musculation" }), "strength");
  assert.equal(inferSessionKind({ location: "Piscine Erstein" }), "swim");
});

test("formatLocalDateISO preserves the local calendar date", () => {
  assert.equal(formatLocalDateISO(new Date(2026, 3, 7, 0, 0, 0)), "2026-04-07");
  assert.equal(formatLocalDateISO(new Date(2026, 11, 31, 23, 59, 59)), "2026-12-31");
});

test("findStrengthRunForSlot falls back to local date and slot for legacy runs", () => {
  const assignmentRun = {
    id: 1,
    assignment_id: 42,
    started_at: "2026-04-07T18:00:00+02:00",
  };
  const legacyRun = {
    id: 2,
    started_at: "2026-04-07T18:30:00+02:00",
  };
  const dateOnlyRun = {
    id: 3,
    date: "2026-04-08",
  };

  assert.equal(
    findStrengthRunForSlot([legacyRun, assignmentRun], {
      iso: "2026-04-07",
      slotKey: "PM",
      assignmentId: 42,
    })?.id,
    1,
  );

  assert.equal(
    findStrengthRunForSlot([legacyRun], {
      iso: "2026-04-07",
      slotKey: "PM",
    })?.id,
    2,
  );

  assert.equal(
    findStrengthRunForSlot([dateOnlyRun], {
      iso: "2026-04-08",
      slotKey: "PM",
    })?.id,
    3,
  );
});

test("getStrengthRunIndicatorValue uses set difficulty before run-level fallback", () => {
  const runWithLogs = {
    id: 10,
    feeling: 2,
    fatigue: 4,
    strength_set_logs: [
      { exercise_id: 1, difficulty: 4 },
      { exercise_id: 1, difficulty: 5 },
      { exercise_id: 1, difficulty: 3 },
    ],
  };

  assert.equal(getStrengthRunDifficulty(runWithLogs), 4);
  assert.equal(getStrengthRunIndicatorValue(runWithLogs, "difficulty"), 4);
  assert.equal(getStrengthRunIndicatorValue(runWithLogs, "fatigue"), 4);
});

test("getStrengthRunIndicatorValue falls back to raw payload and run fields", () => {
  const run = {
    id: 11,
    feeling: 5,
    raw_payload: { fatigue: 3 },
  };

  assert.equal(getStrengthRunIndicatorValue(run, "difficulty"), 5);
  assert.equal(getStrengthRunIndicatorValue(run, "fatigue"), 3);
});

test("describeIndicatorValue returns a clickable explanation for valid notes", () => {
  const tooltip = describeIndicatorValue(
    {
      key: "feeling",
      shortLabel: "Fat.",
      fullLabel: "Fatigue fin",
      mode: "hard",
      descriptions: ["Tres frais", "Plutot frais", "Normal", "Fatigue", "Epuise"],
    },
    5,
  );

  assert.equal(tooltip, "Fatigue fin 5/5 - Epuise");
  assert.equal(describeIndicatorValue(
    {
      key: "performance",
      shortLabel: "Perf.",
      fullLabel: "Performance percue",
      mode: "good",
      descriptions: ["Tres mauvaise", "Plutot mauvaise", "Moyenne", "Plutot bonne", "Excellente"],
    },
    null,
  ), null);
});
