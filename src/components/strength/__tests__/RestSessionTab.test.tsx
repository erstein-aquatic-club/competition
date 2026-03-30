import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RestSessionTab } from "@/components/strength/RestSessionTab";
import type { Exercise, StrengthSessionItem } from "@/lib/api/types";
import type { SetLogEntry } from "@/lib/types";

const exercises: Exercise[] = [
  { id: 1, nom_exercice: "Développé couché", exercise_type: "strength" },
  { id: 2, nom_exercice: "Squat", exercise_type: "strength" },
  { id: 3, nom_exercice: "Tirage vertical", exercise_type: "strength" },
];

const items: StrengthSessionItem[] = [
  { exercise_id: 1, order_index: 0, sets: 4, reps: 8, rest_seconds: 120, percent_1rm: 75 },
  { exercise_id: 2, order_index: 1, sets: 3, reps: 10, rest_seconds: 90, percent_1rm: 70 },
  { exercise_id: 3, order_index: 2, sets: 3, reps: 12, rest_seconds: 60, percent_1rm: 65 },
];

const logs: SetLogEntry[] = [
  { exercise_id: 1, set_index: 0, reps: 8, weight: 80 },
];

test("renders progress count", () => {
  const markup = renderToStaticMarkup(
    <RestSessionTab
      items={items}
      logs={logs}
      exercises={exercises}
      currentStep={1}
      progressPct={33}
    />,
  );

  assert.ok(markup.includes("1"), "should include current step");
  assert.ok(markup.includes("3"), "should include total steps");
  assert.ok(markup.includes("Progression"), "should include 'Progression' label");
});

test("renders total volume", () => {
  const logsForVolume: SetLogEntry[] = [
    { exercise_id: 1, set_index: 0, reps: 8, weight: 80 },
    { exercise_id: 2, set_index: 0, reps: 10, weight: 60 },
  ];
  // volume = 80*8 + 60*10 = 640 + 600 = 1240
  const markup = renderToStaticMarkup(
    <RestSessionTab
      items={items}
      logs={logsForVolume}
      exercises={exercises}
      currentStep={2}
      progressPct={66}
    />,
  );

  // "1 240 kg" formatted with non-breaking space
  assert.ok(markup.includes("1"), "should include thousands digit");
  assert.ok(markup.includes("240"), "should include remainder digits");
  assert.ok(markup.includes("kg"), "should include kg unit");
});

test("renders remaining exercise names", () => {
  const markup = renderToStaticMarkup(
    <RestSessionTab
      items={items}
      logs={logs}
      exercises={exercises}
      currentStep={1}
      progressPct={33}
    />,
  );

  assert.ok(markup.includes("Squat"), "should include remaining exercise Squat");
  assert.ok(markup.includes("Tirage vertical"), "should include remaining exercise Tirage vertical");
});

test("renders last set summary with weight and reps", () => {
  const markup = renderToStaticMarkup(
    <RestSessionTab
      items={items}
      logs={logs}
      exercises={exercises}
      currentStep={1}
      progressPct={33}
    />,
  );

  assert.ok(markup.includes("Développé couché"), "should include last exercise name");
  assert.ok(markup.includes("80"), "should include weight from last log");
  assert.ok(markup.includes("8"), "should include reps from last log");
  assert.ok(markup.includes("Dernière série"), "should show last set label");
});

test("excludes bodyweight exercises from volume", () => {
  // weight = -1 is the BODYWEIGHT_SENTINEL
  const bwLogs: SetLogEntry[] = [
    { exercise_id: 1, set_index: 0, reps: 10, weight: -1 },
    { exercise_id: 2, set_index: 0, reps: 8, weight: 60 },
  ];
  // volume = 0 (bodyweight excluded) + 60*8 = 480
  const markup = renderToStaticMarkup(
    <RestSessionTab
      items={items}
      logs={bwLogs}
      exercises={exercises}
      currentStep={2}
      progressPct={66}
    />,
  );

  assert.ok(markup.includes("480"), "should show 480 kg (bodyweight excluded)");
});
