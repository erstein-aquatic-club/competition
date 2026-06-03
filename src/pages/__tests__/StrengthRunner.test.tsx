import React from "react";
import assert from "node:assert/strict";
import { test, describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  WorkoutRunner,
  resolveNextStep,
  resolveSetNumber,
  detectBlockChapter,
  findFirstMainStep,
} from "@/components/strength/WorkoutRunner";
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

// resolveSetNumber: defensive parsing for log entries written by older
// versions where the set index could come from any of three keys.
test("resolveSetNumber falls back to fallbackIndex for missing/invalid values", () => {
  assert.strictEqual(resolveSetNumber({ set_index: 3 } as any, 1), 3);
  assert.strictEqual(resolveSetNumber({ set_number: 5 } as any, 1), 5);
  assert.strictEqual(resolveSetNumber({ setIndex: 7 } as any, 1), 7);
  assert.strictEqual(resolveSetNumber(null, 4), 4);
  assert.strictEqual(resolveSetNumber({} as any, 2), 2);
  assert.strictEqual(resolveSetNumber({ set_index: -1 } as any, 9), 9);
});

// resolveNextStep covers the substitute scenario: when the current item is
// swapped to a different exercise_id, the lookup of "logs for the new
// exercise" returns 0 → resolvedStep stays at the substituted index, and the
// useEffect inside WorkoutRunner that consumes this value will reset
// currentSetIndex to 1. This is the foundation of the "substitute does not
// silently skip the new exercise" guarantee.
test("resolveNextStep returns the substituted index when no logs exist for the new exercise", () => {
  const items = [
    { exercise_id: 10, exercise_name: "X", sets: 4, reps: 8, rest_seconds: 90, percent_1rm: 0, order_index: 0 },
    { exercise_id: 20, exercise_name: "Y", sets: 3, reps: 10, rest_seconds: 60, percent_1rm: 0, order_index: 1 },
  ];
  // User logged 2 sets of X then substituted Y (index 1) for a brand new Z.
  const logs = [
    { exercise_id: 10, set_number: 1, reps: 8, weight: 50 },
    { exercise_id: 10, set_number: 2, reps: 8, weight: 50 },
  ];
  // After substitute, items[1].exercise_id becomes 99 (Z). Logs for Z = 0.
  const itemsAfterSubstitute = [
    items[0],
    { ...items[1], exercise_id: 99, exercise_name: "Z" },
  ];
  // X has 2/4 sets logged → resolvedStep is X (index 1).
  assert.strictEqual(resolveNextStep(itemsAfterSubstitute, logs), 1);
});

test("resolveNextStep advances past a substituted exercise once the swap target is fully logged", () => {
  const items = [
    { exercise_id: 99, exercise_name: "Z", sets: 2, reps: 10, rest_seconds: 60, percent_1rm: 0, order_index: 0 },
    { exercise_id: 30, exercise_name: "Final", sets: 3, reps: 6, rest_seconds: 120, percent_1rm: 0, order_index: 1 },
  ];
  // 2 sets of Z logged after substitution → step should advance to index 2 (Final).
  const logs = [
    { exercise_id: 99, set_number: 1, reps: 10, weight: 40 },
    { exercise_id: 99, set_number: 2, reps: 10, weight: 40 },
  ];
  assert.strictEqual(resolveNextStep(items, logs), 2);
});

test("resolveNextStep returns items.length+1 once every block is complete", () => {
  const items = [
    { exercise_id: 10, exercise_name: "X", sets: 1, reps: 8, rest_seconds: 60, percent_1rm: 0, order_index: 0 },
    { exercise_id: 20, exercise_name: "Y", sets: 1, reps: 8, rest_seconds: 60, percent_1rm: 0, order_index: 1 },
  ];
  const logs = [
    { exercise_id: 10, set_number: 1, reps: 8, weight: 50 },
    { exercise_id: 20, set_number: 1, reps: 8, weight: 40 },
  ];
  // step = items.length + 1 signals the runner's "completion" view.
  assert.strictEqual(resolveNextStep(items, logs), items.length + 1);
});

// ---------------------------------------------------------------------------
// detectBlockChapter
// ---------------------------------------------------------------------------

describe("detectBlockChapter", () => {
  const warmupItem = { exercise_id: 1, exercise_name: "Mob épaule", sets: 1, reps: 10, rest_seconds: 0, percent_1rm: 0, order_index: 0, block: "warmup" as const };
  const mainItem   = { exercise_id: 2, exercise_name: "Tractions", sets: 4, reps: 6, rest_seconds: 90, percent_1rm: 0, order_index: 1, block: "main" as const };

  it("retourne 'warmup' au démarrage (fromStep=0) si 1er item est warmup", () => {
    const items = [warmupItem, mainItem];
    assert.strictEqual(detectBlockChapter(items, 0, 1), "warmup");
  });

  it("retourne 'main' au démarrage (fromStep=0) si 1er item est main", () => {
    const items = [mainItem];
    assert.strictEqual(detectBlockChapter(items, 0, 1), "main");
  });

  it("retourne null si fromStep et toStep sont dans le même bloc warmup", () => {
    const warmupItem2 = { ...warmupItem, exercise_id: 3, order_index: 1 };
    const items = [warmupItem, warmupItem2, mainItem];
    assert.strictEqual(detectBlockChapter(items, 1, 2), null);
  });

  it("retourne 'main' lors de la transition warmup → main", () => {
    const items = [warmupItem, mainItem];
    assert.strictEqual(detectBlockChapter(items, 1, 2), "main");
  });

  it("retourne null si la liste est vide", () => {
    assert.strictEqual(detectBlockChapter([], 0, 1), null);
  });
});

// ---------------------------------------------------------------------------
// findFirstMainStep
// ---------------------------------------------------------------------------

describe("findFirstMainStep", () => {
  const warmupItem = { exercise_id: 1, exercise_name: "Mob épaule", sets: 1, reps: 10, rest_seconds: 0, percent_1rm: 0, order_index: 0, block: "warmup" as const };
  const mainItem   = { exercise_id: 2, exercise_name: "Tractions", sets: 4, reps: 6, rest_seconds: 90, percent_1rm: 0, order_index: 1, block: "main" as const };
  const nullBlockItem = { exercise_id: 3, exercise_name: "Legacy", sets: 3, reps: 8, rest_seconds: 60, percent_1rm: 0, order_index: 2 };

  it("retourne 2 quand 1 warmup + 1 main", () => {
    assert.strictEqual(findFirstMainStep([warmupItem, mainItem]), 2);
  });

  it("retourne 1 quand le 1er item est main", () => {
    assert.strictEqual(findFirstMainStep([mainItem, warmupItem]), 1);
  });

  it("retourne items.length+1 si tout est warmup", () => {
    const allWarmup = [warmupItem, { ...warmupItem, exercise_id: 99, order_index: 1 }];
    assert.strictEqual(findFirstMainStep(allWarmup), allWarmup.length + 1);
  });

  it("traite block=null comme main", () => {
    assert.strictEqual(findFirstMainStep([warmupItem, nullBlockItem]), 2);
  });
});
