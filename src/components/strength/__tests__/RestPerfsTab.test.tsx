import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RestPerfsTab } from "@/components/strength/RestPerfsTab";
import type { SetLogEntry } from "@/lib/types";

const makeLogs = (entries: Array<{ weight: number; reps: number }>): SetLogEntry[] =>
  entries.map((e, i) => ({
    exercise_id: 1,
    set_index: i,
    weight: e.weight,
    reps: e.reps,
  }));

test("renders 1RM value and target weight when provided", () => {
  const markup = renderToStaticMarkup(
    <RestPerfsTab
      exerciseName="Développé couché"
      oneRmWeight={100}
      targetWeight={80}
      percentOneRm={80}
      todayLogs={[]}
    />,
  );

  assert.ok(markup.includes("100"), "should render 1RM value");
  assert.ok(markup.includes("80"), "should render target weight");
  assert.ok(markup.includes("1RM"), "should render 1RM label");
  assert.ok(markup.includes("Cible"), "should render target label");
});

test("renders percentage of 1RM in progress bar section", () => {
  const logs = makeLogs([{ weight: 75, reps: 5 }]);
  const markup = renderToStaticMarkup(
    <RestPerfsTab
      exerciseName="Squat"
      oneRmWeight={100}
      targetWeight={75}
      percentOneRm={75}
      todayLogs={logs}
    />,
  );

  assert.ok(markup.includes("75%"), "should render actual % of 1RM");
  assert.ok(markup.includes("Intensité"), "should render intensity label");
});

test("renders without 1RM — shows logged weight data instead", () => {
  const logs = makeLogs([
    { weight: 60, reps: 8 },
    { weight: 70, reps: 5 },
  ]);
  const markup = renderToStaticMarkup(
    <RestPerfsTab
      exerciseName="Soulevé de terre"
      oneRmWeight={0}
      targetWeight={0}
      percentOneRm={0}
      todayLogs={logs}
    />,
  );

  // Should not render 1RM section (no 1RM)
  assert.ok(!markup.includes(">1RM<"), "should NOT render 1RM section");
  // Best set should display best logged weight
  assert.ok(markup.includes("70"), "should show best logged weight");
  assert.ok(markup.includes("Meilleure série"), "should render best set label");
});

test("renders fallback message when no data at all", () => {
  const markup = renderToStaticMarkup(
    <RestPerfsTab
      exerciseName="Pompes"
      oneRmWeight={0}
      targetWeight={0}
      percentOneRm={0}
      todayLogs={[]}
    />,
  );

  assert.ok(
    markup.includes("Aucune donnée de performance disponible pour cet exercice."),
    "should show fallback message",
  );
  assert.ok(!markup.includes("1RM estimé"), "should NOT render 1RM section");
  assert.ok(!markup.includes("Charge cible"), "should NOT render target section");
});

test("excludes bodyweight logs from weight computations", () => {
  // BODYWEIGHT_SENTINEL = -1
  const logs: SetLogEntry[] = [
    { exercise_id: 1, set_index: 0, weight: -1, reps: 10 },
    { exercise_id: 1, set_index: 1, weight: -1, reps: 12 },
  ];
  const markup = renderToStaticMarkup(
    <RestPerfsTab
      exerciseName="Tractions"
      oneRmWeight={0}
      targetWeight={0}
      percentOneRm={0}
      todayLogs={logs}
    />,
  );

  // Bodyweight logs only — no weighted data → fallback
  assert.ok(
    markup.includes("Aucune donnée de performance disponible pour cet exercice."),
    "should show fallback for bodyweight-only logs",
  );
});
