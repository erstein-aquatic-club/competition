// §369 — Tests vitest jsdom de la carte série 1 AUGMENTÉE (calibration 1RM
// inline). Le harness SSR node:test (StrengthRunner.test.tsx) ne peut pas
// cliquer ; ici on couvre le chemin de COMPUTE que le SSR ne peut pas :
//  - RIR par défaut = 2 (pré-sélectionné, anti sous-estimation) ;
//  - changer la pastille RIR met à jour la sélection ;
//  - valider la série 1 calcule la 1RM via estimateOneRM(w, r, {rir}) et
//    appelle onEstimationComplete avec cette valeur.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

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

// Audit robustesse muscu (lot 2, constat 4) — un double-tap sur « Valider
// série » enregistrait une série FANTÔME : le 2ᵉ tap tombait sur le bouton
// re-rendu de la série/l'exo suivant (sans repos auto, rien ne le recouvre).
describe("anti double-tap « Valider série »", () => {
  const twoExoSession = {
    id: 77,
    name: "Séance double-tap",
    items: [
      { exercise_id: 21, exercise_name: "Gainage", order_index: 0, sets: 1, reps: 5, rest_seconds: 0, percent_1rm: null, block: "main" },
      { exercise_id: 22, exercise_name: "Pompes", order_index: 1, sets: 2, reps: 5, rest_seconds: 0, percent_1rm: null, block: "main" },
    ],
  } as unknown as StrengthSessionTemplate;
  const catalog = [
    { id: 21, nom_exercice: "Gainage", exercise_type: "strength" },
    { id: 22, nom_exercice: "Pompes", exercise_type: "strength" },
  ] as unknown as Exercise[];

  function setup() {
    const logged: Array<{ exercise_id: number; set_number?: number }> = [];
    render(
      <WorkoutRunner
        session={twoExoSession}
        exercises={catalog}
        oneRMs={[]}
        onFinish={() => undefined}
        initialStep={1}
        userId={1}
        onLogSets={async (blockLogs) => {
          logged.push(...(blockLogs as typeof logged));
        }}
      />,
    );
    const goBtn = screen.queryByRole("button", { name: /On y va/i });
    if (goBtn) fireEvent.click(goBtn);
    return logged;
  }

  it("deux taps rapprochés sur la dernière série n'enregistrent qu'UNE série", async () => {
    const logged = setup();
    fireEvent.click(screen.getByRole("button", { name: "Valider série" }));
    await act(async () => {});
    // 2ᵉ tap immédiat : le bouton affiché est désormais celui de l'exo suivant.
    const next = screen.queryByRole("button", { name: "Valider série" });
    if (next) fireEvent.click(next);
    await act(async () => {});
    expect(logged.map((l) => l.exercise_id)).toEqual([21]);
  });

  it("une validation volontaire après le délai anti-rebond est acceptée", async () => {
    const logged = setup();
    const t0 = Date.now();
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(t0);
    fireEvent.click(screen.getByRole("button", { name: "Valider série" }));
    await act(async () => {});
    nowSpy.mockReturnValue(t0 + 5_000);
    fireEvent.click(screen.getByRole("button", { name: "Valider série" }));
    await act(async () => {});
    nowSpy.mockRestore();
    expect(logged.map((l) => l.exercise_id)).toEqual([21, 22]);
  });
});

describe("permuter les exercices pendant le focus", () => {
  const session = {
    id: 91,
    name: "Séance 3 exercices",
    items: [
      { exercise_id: 11, exercise_name: "Exercice 1", order_index: 0, sets: 1, reps: 5, rest_seconds: 0, block: "main" },
      { exercise_id: 12, exercise_name: "Exercice 2", order_index: 1, sets: 1, reps: 5, rest_seconds: 0, block: "main" },
      { exercise_id: 13, exercise_name: "Exercice 3", order_index: 2, sets: 1, reps: 5, rest_seconds: 0, block: "main" },
    ],
  } as unknown as StrengthSessionTemplate;
  const catalog = [11, 12, 13].map((id, i) =>
    ({ id, nom_exercice: `Exercice ${i + 1}`, exercise_type: "strength" } as Exercise),
  );
  const firstDone = [{ exercise_id: 11, set_number: 1, reps: 5, weight: 0 }];

  it("remonte le 3e avant le 2e, sans altérer les exercices planifiés", () => {
    render(
      <WorkoutRunner
        session={session}
        exercises={catalog}
        oneRMs={[]}
        onFinish={() => undefined}
        initialStep={2}
        initialLogs={firstDone}
        userId={1}
      />,
    );
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Exercice 2");
    fireEvent.click(screen.getByRole("button", { name: "Voir les séries" }));
    fireEvent.click(screen.getByRole("button", { name: "Faire passer Exercice 3 avant Exercice 2" }));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Exercice 3");
    expect(session.items?.[1]?.exercise_id).toBe(12);
  });

  it("retrouve le nouvel ordre après démontage/reprise PWA du même run", () => {
    window.localStorage.removeItem("strength-exercise-order:1:910");
    const props = {
      session,
      exercises: catalog,
      oneRMs: [],
      onFinish: () => undefined,
      initialStep: 2,
      initialLogs: firstDone,
      runId: 910,
      userId: 1,
    };
    const instance = render(<WorkoutRunner {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Voir les séries" }));
    fireEvent.click(screen.getByRole("button", { name: "Faire passer Exercice 3 avant Exercice 2" }));
    expect(JSON.parse(window.localStorage.getItem("strength-exercise-order:1:910") ?? "null")).toEqual([0, 2, 1]);
    instance.unmount();
    render(<WorkoutRunner {...props} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Exercice 3");
    window.localStorage.removeItem("strength-exercise-order:1:910");
  });

  it("interdit la permutation si l'exercice en cours a déjà une série", () => {
    const startedSession = {
      ...session,
      items: session.items?.map((item, index) => index === 1 ? { ...item, sets: 2 } : item),
    } as StrengthSessionTemplate;
    render(
      <WorkoutRunner
        session={startedSession}
        exercises={catalog}
        oneRMs={[]}
        onFinish={() => undefined}
        initialStep={2}
        initialLogs={[...firstDone, { exercise_id: 12, set_number: 1, reps: 5, weight: 0 }]}
        userId={1}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Voir les séries" }));
    expect(
      screen.getByRole("button", { name: "Faire passer Exercice 3 avant Exercice 2" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});
