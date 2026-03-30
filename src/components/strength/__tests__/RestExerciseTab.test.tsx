import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RestExerciseTab } from "@/components/strength/RestExerciseTab";
import type { Exercise, StrengthSessionItem } from "@/lib/api/types";

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

test("renders exercise name and prescription values", () => {
  const markup = renderToStaticMarkup(
    <RestExerciseTab
      exercise={exercise}
      block={block}
      targetWeight={80}
      muscleTags={[]}
      note={null}
      isTransition={false}
    />,
  );

  assert.ok(markup.includes("Développé couché"), "should include exercise name");
  assert.ok(markup.includes("4"), "should include sets count");
  assert.ok(markup.includes("8"), "should include reps count");
  assert.ok(markup.includes("75"), "should include percent 1RM");
  assert.ok(markup.includes("80"), "should include target weight");
});

test("renders muscle tags", () => {
  const markup = renderToStaticMarkup(
    <RestExerciseTab
      exercise={exercise}
      block={block}
      targetWeight={0}
      muscleTags={["Pectoraux", "Triceps", "Épaules"]}
      note={null}
      isTransition={false}
    />,
  );

  assert.ok(markup.includes("Pectoraux"), "should include muscle tag Pectoraux");
  assert.ok(markup.includes("Triceps"), "should include muscle tag Triceps");
  assert.ok(markup.includes("Épaules"), "should include muscle tag Épaules");
});

test("renders coach notes", () => {
  const markup = renderToStaticMarkup(
    <RestExerciseTab
      exercise={exercise}
      block={block}
      targetWeight={0}
      muscleTags={[]}
      note="Contrôler la descente sur 3 secondes"
      isTransition={false}
    />,
  );

  assert.ok(
    markup.includes("Contrôler la descente sur 3 secondes"),
    "should include coach note text",
  );
});

test("shows 'Exercice en cours' when isTransition=false", () => {
  const markup = renderToStaticMarkup(
    <RestExerciseTab
      exercise={exercise}
      block={block}
      targetWeight={0}
      muscleTags={[]}
      note={null}
      isTransition={false}
    />,
  );

  assert.ok(
    markup.includes("Exercice en cours"),
    "should show 'Exercice en cours'",
  );
  assert.ok(
    !markup.includes("Prochain exercice"),
    "should NOT show 'Prochain exercice'",
  );
});

test("shows 'Prochain exercice' when isTransition=true", () => {
  const markup = renderToStaticMarkup(
    <RestExerciseTab
      exercise={exercise}
      block={block}
      targetWeight={0}
      muscleTags={[]}
      note={null}
      isTransition={true}
    />,
  );

  assert.ok(
    markup.includes("Prochain exercice"),
    "should show 'Prochain exercice'",
  );
  assert.ok(
    !markup.includes("Exercice en cours"),
    "should NOT show 'Exercice en cours'",
  );
});
