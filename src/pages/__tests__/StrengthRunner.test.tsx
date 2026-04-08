import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkoutRunner } from "@/components/strength/WorkoutRunner";
import type { StrengthSessionTemplate, Exercise } from "@/lib/api";

const session: StrengthSessionTemplate = {
  id: 1,
  title: "Séance test",
  description: "Routine haut du corps",
  cycle: "endurance",
  items: [
    {
      exercise_id: 10,
      exercise_name: "Développé couché",
      sets: 3,
      reps: 8,
      rest_seconds: 90,
      percent_1rm: 0,
      order_index: 0,
    },
  ],
};

const exercises: Exercise[] = [
  {
    id: 10,
    nom_exercice: "Développé couché",
    description: "Contrôle et amplitude",
    exercise_type: "strength",
  },
];

test("WorkoutRunner renders execution state", () => {
  const markup = renderToStaticMarkup(
    <WorkoutRunner
      session={session}
      exercises={exercises}
      oneRMs={[]}
      onFinish={() => undefined}
      initialStep={1}
      userId={1}
    />,
  );

  assert.ok(markup.includes("Série"));
  assert.ok(markup.includes("reps"));
  assert.ok(markup.includes("Développé couché"));
});

test("WorkoutRunner renders finish state", () => {
  const markup = renderToStaticMarkup(
    <WorkoutRunner
      session={session}
      exercises={exercises}
      oneRMs={[]}
      onFinish={() => undefined}
      initialStep={2}
      userId={1}
    />,
  );

  assert.ok(markup.includes("Séance Terminée"));
  assert.ok(markup.includes("Difficulté de la séance"));
});

test("WorkoutRunner renders input modal when open", () => {
  const markup = renderToStaticMarkup(
    <WorkoutRunner
      session={session}
      exercises={exercises}
      oneRMs={[]}
      onFinish={() => undefined}
      initialStep={1}
      userId={1}
      initialInputOpen
    />,
  );

  assert.ok(markup.includes("Charge"));
});
