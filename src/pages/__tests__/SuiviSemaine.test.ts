import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeIndicatorValue,
  formatClockTime,
  formatSlotTime,
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
