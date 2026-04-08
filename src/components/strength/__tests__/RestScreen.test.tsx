import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RestScreen } from "@/components/strength/RestScreen";
import type { Exercise, StrengthSessionItem } from "@/lib/api/types";
import type { SetLogEntry } from "@/lib/types";

const exercise: Exercise = {
  id: 1,
  nom_exercice: "Développé couché",
  description: "Mouvement compound pectoraux",
  exercise_type: "strength",
  illustration_gif: null,
};

const block: StrengthSessionItem = {
  exercise_id: 1,
  exercise_name: "Développé couché",
  sets: 4,
  reps: 8,
  rest_seconds: 120,
  percent_1rm: 75,
  order_index: 0,
};

const logs: SetLogEntry[] = [];

const defaultProps = {
  restTimer: 85,
  restDuration: 120,
  restType: "set" as const,
  exercise,
  block,
  nextExercise: null,
  nextBlock: null,
  targetWeight: 80,
  muscleTags: ["Pectoraux", "Triceps"],
  note: null,
  items: [block],
  logs,
  exercises: [exercise],
  currentStep: 1,
  progressPct: 50,
  oneRmWeight: 100,
  percentOneRm: 75,
  athleteNote: "",
  exerciseId: 1,
  onClose: () => undefined,
  onSkip: () => undefined,
  onAdd30s: () => undefined,
};

test("renders timer text correctly (1:25 for restTimer=85)", () => {
  const markup = renderToStaticMarkup(<RestScreen {...defaultProps} />);
  // 85s = 1 min 25s → "1:25"
  assert.ok(markup.includes("1:25"), `expected '1:25' in markup`);
});

test("renders 3 pagination dot buttons with aria-labels", () => {
  const markup = renderToStaticMarkup(<RestScreen {...defaultProps} />);
  assert.ok(markup.includes("Exercice"), "should have dot for Exercice tab");
  assert.ok(markup.includes("Séance"), "should have dot for Séance tab");
  assert.ok(markup.includes("Perfs"), "should have dot for Perfs tab");
});

test("renders RestExerciseTab content by default (exercise name visible)", () => {
  const markup = renderToStaticMarkup(<RestScreen {...defaultProps} />);
  assert.ok(markup.includes("Développé couché"), "exercise name should be visible on first tab");
});

test("shows 'Repos' label for restType=set", () => {
  const markup = renderToStaticMarkup(<RestScreen {...defaultProps} restType="set" />);
  assert.ok(markup.includes("Repos"), "should show 'Repos' for set rest");
});

test("shows 'Transition' label for restType=exercise", () => {
  const markup = renderToStaticMarkup(
    <RestScreen {...defaultProps} restType="exercise" />,
  );
  assert.ok(markup.includes("Transition"), "should show 'Transition' for exercise rest");
});

test("renders tap pour passer and +30s button", () => {
  const markup = renderToStaticMarkup(<RestScreen {...defaultProps} />);
  assert.ok(markup.includes("tap pour passer"), "should show skip hint");
  assert.ok(markup.includes("+30s"), "should show +30s button");
});

test("renders timer as 0:00 when restTimer=0", () => {
  const markup = renderToStaticMarkup(<RestScreen {...defaultProps} restTimer={0} />);
  assert.ok(markup.includes("0:00"), "should show 0:00 when restTimer is 0");
});
