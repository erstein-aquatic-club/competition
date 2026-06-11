// §369 — Tests vitest jsdom de la carte série 1 AUGMENTÉE (calibration 1RM
// inline). Le harness SSR node:test (StrengthRunner.test.tsx) ne peut pas
// cliquer ; ici on couvre le chemin de COMPUTE que le SSR ne peut pas :
//  - RIR par défaut = 2 (pré-sélectionné, anti sous-estimation) ;
//  - changer la pastille RIR met à jour la sélection ;
//  - valider la série 1 calcule la 1RM via estimateOneRM(w, r, {rir}) et
//    appelle onEstimationComplete avec cette valeur.
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { WorkoutRunner } from "@/components/strength/WorkoutRunner";
import { estimateOneRM } from "@/lib/prDetection";
import type { StrengthSessionItem, StrengthSessionTemplate, Exercise } from "@/lib/api/types";

function calibSession(over: Partial<StrengthSessionItem> = {}): StrengthSessionTemplate {
  return {
    id: 9,
    name: "Séance calibration",
    items: [
      {
        exercise_id: 10,
        exercise_name: "Développé couché",
        order_index: 0,
        sets: 3,
        reps: 8,
        rest_seconds: 90,
        percent_1rm: 80,
        ...over,
      },
    ],
  } as unknown as StrengthSessionTemplate;
}

const exercises: Exercise[] = [
  { id: 10, nom_exercice: "Développé couché", exercise_type: "strength" } as unknown as Exercise,
];

function renderRunner(extra: Record<string, unknown> = {}) {
  const utils = render(
    <WorkoutRunner
      session={calibSession()}
      exercises={exercises}
      oneRMs={[]}
      onFinish={() => undefined}
      initialStep={1}
      userId={1}
      {...extra}
    />,
  );
  // En jsdom les effets s'exécutent → un écran d'intro de chapitre (« Bloc
  // principal » / bouton « On y va ! ») recouvre la carte d'exécution. On le
  // ferme pour atteindre la carte série 1 augmentée. (Le harness SSR ne lance
  // pas cet effet, d'où l'absence du clic là-bas.)
  const goBtn = screen.queryByRole("button", { name: /On y va/i });
  if (goBtn) fireEvent.click(goBtn);
  return utils;
}

// §376 — Régression terrain (substitution en mode focus) : resolveNextStep
// renvoie le PREMIER item aux logs incomplets. Un échauffement passé via
// « Passer l'échauffement » ne logge rien → quand `session.items` change
// (substitution Task 14), l'effet de réconciliation recalculait la position
// et TÉLÉPORTAIT l'utilisateur au step 1, section échauffement. La
// réconciliation ne doit jamais déplacer le step vers l'arrière.
describe("§376 substitution mid-séance — pas de retour à l'échauffement", () => {
  const warmupItem = {
    exercise_id: 1,
    exercise_name: "Mobilité épaules",
    order_index: 0,
    sets: 2,
    reps: 10,
    rest_seconds: 30,
    percent_1rm: 0,
    block: "warmup" as const,
  };
  const mainItem1 = {
    exercise_id: 2,
    exercise_name: "Tractions lestées",
    order_index: 1,
    sets: 1,
    reps: 5,
    rest_seconds: 120,
    percent_1rm: 80,
    block: "main" as const,
  };
  const mainItem2 = {
    exercise_id: 3,
    exercise_name: "Bench Pull",
    order_index: 2,
    sets: 3,
    reps: 6,
    rest_seconds: 120,
    percent_1rm: 75,
    block: "main" as const,
  };

  const session = {
    id: 42,
    name: "Séance focus",
    items: [warmupItem, mainItem1, mainItem2],
  } as unknown as StrengthSessionTemplate;

  const catalog: Exercise[] = [
    { id: 1, nom_exercice: "Mobilité épaules", exercise_type: "strength" },
    { id: 2, nom_exercice: "Tractions lestées", exercise_type: "strength" },
    { id: 3, nom_exercice: "Bench Pull", exercise_type: "strength" },
    { id: 4, nom_exercice: "Tirage poulie", exercise_type: "strength" },
  ] as unknown as Exercise[];

  // Échauffement passé (aucun log pour l'exo 1), item main 1 complété,
  // utilisateur positionné sur l'item 3 (Bench Pull).
  const logs = [{ exercise_id: 2, set_number: 1, reps: 5, weight: 50 }];

  function currentTitle() {
    return screen.getByRole("heading", { level: 2 }).textContent;
  }

  it("reste sur l'exo courant au montage malgré un échauffement passé (non loggé)", () => {
    render(
      <WorkoutRunner
        session={session}
        exercises={catalog}
        oneRMs={[]}
        onFinish={() => undefined}
        initialStep={3}
        initialLogs={logs}
        userId={1}
      />,
    );
    expect(currentTitle()).toBe("Bench Pull");
  });

  it("reste sur l'exo substitué quand session.items change mid-séance", () => {
    const { rerender } = render(
      <WorkoutRunner
        session={session}
        exercises={catalog}
        oneRMs={[]}
        onFinish={() => undefined}
        initialStep={3}
        initialLogs={logs}
        userId={1}
      />,
    );
    // Substitution de l'exo courant (Bench Pull → Tirage poulie) : le parent
    // remplace items[2] et repasse une nouvelle référence de session.
    const substituted = {
      ...session,
      items: [warmupItem, mainItem1, { ...mainItem2, exercise_id: 4, exercise_name: "Tirage poulie" }],
    } as unknown as StrengthSessionTemplate;
    rerender(
      <WorkoutRunner
        session={substituted}
        exercises={catalog}
        oneRMs={[]}
        onFinish={() => undefined}
        initialStep={3}
        initialLogs={logs}
        userId={1}
      />,
    );
    expect(currentTitle()).toBe("Tirage poulie");
  });
});

describe("§369 carte série 1 augmentée (jsdom)", () => {
  it("RIR par défaut = 2 pré-sélectionné (anti sous-estimation)", () => {
    renderRunner();
    const rir2 = screen.getByRole("button", { name: "Reps en réserve : 2" });
    expect(rir2.getAttribute("aria-pressed")).toBe("true");
    // Les autres pastilles ne sont pas pré-sélectionnées.
    expect(
      screen.getByRole("button", { name: "Reps en réserve : 0" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("changer la pastille RIR déplace la sélection", () => {
    renderRunner();
    const rir0 = screen.getByRole("button", { name: "Reps en réserve : 0" });
    fireEvent.click(rir0);
    expect(rir0.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen.getByRole("button", { name: "Reps en réserve : 2" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  // Contrat de compute : la valeur que `handleValidateSet` passe à
  // onEstimationComplete est `estimateOneRM(w, r, { rir: calibRir })` avec le
  // défaut calibRir=2. On vérifie ici la propriété qui MOTIVE le défaut 2
  // (anti sous-estimation, fix §369) : estimer avec RIR 2 donne une 1RM
  // STRICTEMENT supérieure à l'estimation « à l'échec » (RIR 0) — donc laisser
  // le champ par défaut ne sous-estime plus la 1RM, contrairement à l'ancien
  // comportement `estimateOneRM(w, r, undefined)` (= RIR 0).
  //
  // GAP documenté : le chemin UI complet (numpad poids+reps → « Valider série »)
  // n'est pas pilotable de façon fiable dans ce harness jsdom — le `Drawer`
  // vaul ne se démonte pas après validation (l'overlay reste monté, la barre
  // d'action « Valider série » n'apparaît pas). Le déclenchement réel de
  // onEstimationComplete au clic « Valider série » est donc couvert
  // manuellement / en e2e, pas ici. Les deux tests de pastille ci-dessus
  // garantissent l'état `calibRir` (défaut 2 + sélection), et ce test garantit
  // la conséquence numérique du défaut.
  it("le défaut RIR 2 ne sous-estime pas la 1RM (vs RIR 0 « à l'échec »)", () => {
    const atFailure = estimateOneRM(60, 8, { rir: 0 });
    const withDefault = estimateOneRM(60, 8, { rir: 2 });
    expect(withDefault).toBeGreaterThan(atFailure);
    // Et l'ancien comportement (effort undefined) équivalait bien à RIR 0.
    expect(estimateOneRM(60, 8, undefined)).toBe(atFailure);
  });
});
