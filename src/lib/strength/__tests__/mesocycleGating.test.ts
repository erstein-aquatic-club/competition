/**
 * Tests TDD — canGenerateMesocycle (§299 W1).
 * Run: npx tsx --test src/lib/strength/__tests__/mesocycleGating.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Import will fail until mesocycleGating.ts is created.
import {
  canGenerateMesocycle,
  applyLikelySucceededDespiteError,
} from "../mesocycleGating.js";

describe("canGenerateMesocycle", () => {
  it("returns true for bilan_pending", () => {
    assert.equal(canGenerateMesocycle("bilan_pending"), true);
  });

  it("returns true for completed", () => {
    assert.equal(canGenerateMesocycle("completed"), true);
  });

  it("returns false for questionnaire_pending", () => {
    assert.equal(canGenerateMesocycle("questionnaire_pending"), false);
  });

  it("returns false for null", () => {
    assert.equal(canGenerateMesocycle(null), false);
  });

  it("returns false for undefined", () => {
    assert.equal(canGenerateMesocycle(undefined), false);
  });
});

// Audit 2026-05-26 (#5) — garde double-apply. Si l'apply time-out côté client
// mais a réussi côté serveur, un re-fetch du mésocycle actif révèle une ligne
// créée PENDANT la tentative → on traite comme un succès (pas de blind retry
// qui créerait un méso superseded en doublon).
describe("applyLikelySucceededDespiteError", () => {
  const ATTEMPT_START = Date.parse("2026-06-01T10:00:00.000Z");

  it("false si aucun mésocycle actif (échec franc, rien créé)", () => {
    assert.equal(applyLikelySucceededDespiteError(ATTEMPT_START, null), false);
    assert.equal(applyLikelySucceededDespiteError(ATTEMPT_START, undefined), false);
  });

  it("false si le méso actif est antérieur à la tentative (ancien plan, échec franc)", () => {
    // Régénération : un vieux méso existait déjà ; l'apply a échoué → toujours l'ancien.
    assert.equal(
      applyLikelySucceededDespiteError(ATTEMPT_START, "2026-05-20T09:00:00.000Z"),
      false,
    );
  });

  it("true si un méso actif a été créé pendant/après la tentative (succès malgré l'erreur)", () => {
    assert.equal(
      applyLikelySucceededDespiteError(ATTEMPT_START, "2026-06-01T10:00:29.000Z"),
      true,
    );
    // Exactement à l'instant de départ (borne incluse).
    assert.equal(
      applyLikelySucceededDespiteError(ATTEMPT_START, "2026-06-01T10:00:00.000Z"),
      true,
    );
  });

  it("false si la date est invalide (dégradation prudente → on n'affirme pas un succès)", () => {
    assert.equal(applyLikelySucceededDespiteError(ATTEMPT_START, "pas-une-date"), false);
  });
});
