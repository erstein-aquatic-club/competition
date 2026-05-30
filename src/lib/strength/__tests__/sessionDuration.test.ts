import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EXEC_SECONDS_PER_SET,
  estimateStrengthSessionDurationSeconds,
  estimateRemainingStrengthSessionDurationSeconds,
  formatApproxMinutes,
} from "@/lib/strength/sessionDuration";
import type { StrengthSessionItem } from "@/lib/api/types";

function makeItem(overrides: Partial<StrengthSessionItem> = {}): StrengthSessionItem {
  return {
    exercise_id: 1,
    order_index: 0,
    sets: 4,
    reps: 8,
    rest_seconds: 90,
    percent_1rm: 0,
    ...overrides,
  };
}

describe("estimateStrengthSessionDurationSeconds", () => {
  it("compte 1 repos par série : sets × (60s exec + repos)", () => {
    // 4 séries, repos 90s → 4 × (60 + 90) = 600s
    const total = estimateStrengthSessionDurationSeconds([makeItem({ sets: 4, rest_seconds: 90 })]);
    assert.equal(total, 600);
  });

  it("somme tous les exercices", () => {
    // 4×(60+90)=600 + 3×(60+60)=360 → 960
    const total = estimateStrengthSessionDurationSeconds([
      makeItem({ sets: 4, rest_seconds: 90 }),
      makeItem({ sets: 3, rest_seconds: 60 }),
    ]);
    assert.equal(total, 960);
  });

  it("repos absent (0) → uniquement le temps d'exécution", () => {
    // 3 × 60 = 180
    const total = estimateStrengthSessionDurationSeconds([makeItem({ sets: 3, rest_seconds: 0 })]);
    assert.equal(total, 180);
  });

  it("séance vide → 0", () => {
    assert.equal(estimateStrengthSessionDurationSeconds([]), 0);
  });

  it("sets nul/négatif/non fini → l'exo compte 0", () => {
    const zero = estimateStrengthSessionDurationSeconds([makeItem({ sets: 0, rest_seconds: 90 })]);
    assert.equal(zero, 0);
    const negative = estimateStrengthSessionDurationSeconds([
      makeItem({ sets: -2 as unknown as number, rest_seconds: 90 }),
    ]);
    assert.equal(negative, 0);
    const nan = estimateStrengthSessionDurationSeconds([
      makeItem({ sets: NaN as unknown as number, rest_seconds: 90 }),
    ]);
    assert.equal(nan, 0);
  });

  it("repos invalide (négatif/non fini) → traité comme 0", () => {
    const total = estimateStrengthSessionDurationSeconds([
      makeItem({ sets: 3, rest_seconds: -30 as unknown as number }),
    ]);
    assert.equal(total, 3 * EXEC_SECONDS_PER_SET);
  });

  it("inclut les items d'échauffement/mobilité", () => {
    // warmup 2×(60+30)=180 + main 4×(60+90)=600 → 780
    const total = estimateStrengthSessionDurationSeconds([
      makeItem({ block: "warmup", sets: 2, rest_seconds: 30 }),
      makeItem({ block: "main", sets: 4, rest_seconds: 90 }),
    ]);
    assert.equal(total, 780);
  });
});

describe("estimateRemainingStrengthSessionDurationSeconds", () => {
  it("au tout début (exo 1, série 1) = durée totale de la séance", () => {
    const items = [
      makeItem({ sets: 4, rest_seconds: 90 }),
      makeItem({ sets: 3, rest_seconds: 60 }),
    ];
    // même modèle que l'aperçu → identique au total au démarrage
    assert.equal(
      estimateRemainingStrengthSessionDurationSeconds(items, 1, 1),
      estimateStrengthSessionDurationSeconds(items),
    );
  });

  it("en milieu d'exo : ne compte que les séries non faites de l'exo en cours", () => {
    // exo 1 = 4 séries rest 90 ; on est sur la série 3 (2 faites) → 2×(60+90)=300
    const items = [makeItem({ sets: 4, rest_seconds: 90 })];
    assert.equal(estimateRemainingStrengthSessionDurationSeconds(items, 1, 3), 300);
  });

  it("décroît de façon monotone série après série", () => {
    const items = [makeItem({ sets: 4, rest_seconds: 90 })];
    const s1 = estimateRemainingStrengthSessionDurationSeconds(items, 1, 1);
    const s2 = estimateRemainingStrengthSessionDurationSeconds(items, 1, 2);
    const s3 = estimateRemainingStrengthSessionDurationSeconds(items, 1, 3);
    assert.ok(s1 > s2 && s2 > s3, `attendu décroissant, reçu ${s1},${s2},${s3}`);
  });

  it("régression symptôme B : passer d'un exo faible-repos à un exo gros-repos FAIT BAISSER l'estimation (repos par item, pas global)", () => {
    // échauffement repos 30s puis gros exo repos 300s
    const items = [
      makeItem({ sets: 4, rest_seconds: 30 }),
      makeItem({ sets: 4, rest_seconds: 300 }),
    ];
    const atWarmupStart = estimateRemainingStrengthSessionDurationSeconds(items, 1, 1);
    const atHeavyStart = estimateRemainingStrengthSessionDurationSeconds(items, 2, 1);
    // total = 4×(60+30) + 4×(60+300) = 360 + 1440 = 1800
    assert.equal(atWarmupStart, 1800);
    // une fois sur le gros exo : seulement 4×(60+300) = 1440 — STRICTEMENT MOINS
    assert.equal(atHeavyStart, 1440);
    assert.ok(atHeavyStart < atWarmupStart, "l'estimation doit baisser, pas exploser");
  });

  it("dernière série du dernier exo → durée d'une seule série restante", () => {
    const items = [
      makeItem({ sets: 3, rest_seconds: 60 }),
      makeItem({ sets: 3, rest_seconds: 120 }),
    ];
    // exo 2, série 3 (2 faites) → 1×(60+120)=180
    assert.equal(estimateRemainingStrengthSessionDurationSeconds(items, 2, 3), 180);
  });

  it("currentSetIndex au-delà du nombre de séries → 0 pour l'exo en cours", () => {
    const items = [makeItem({ sets: 3, rest_seconds: 60 })];
    assert.equal(estimateRemainingStrengthSessionDurationSeconds(items, 1, 5), 0);
  });

  it("séance vide ou step hors bornes → 0 (jamais NaN)", () => {
    assert.equal(estimateRemainingStrengthSessionDurationSeconds([], 1, 1), 0);
    const items = [makeItem({ sets: 3, rest_seconds: 60 })];
    const past = estimateRemainingStrengthSessionDurationSeconds(items, 99, 1);
    assert.ok(Number.isFinite(past), "doit rester fini");
  });
});

describe("formatApproxMinutes", () => {
  it("arrondit à la minute la plus proche avec préfixe ~", () => {
    assert.equal(formatApproxMinutes(600), "~10 min");
    assert.equal(formatApproxMinutes(510), "~9 min"); // 8,5 → 9
    assert.equal(formatApproxMinutes(605), "~10 min");
  });

  it("plancher à 1 min quand la durée est positive mais < 30s", () => {
    assert.equal(formatApproxMinutes(20), "~1 min");
  });
});
