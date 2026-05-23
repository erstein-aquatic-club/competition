/**
 * Tests TDD — canGenerateMesocycle (§299 W1).
 * Run: npx tsx --test src/lib/strength/__tests__/mesocycleGating.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Import will fail until mesocycleGating.ts is created.
import { canGenerateMesocycle } from "../mesocycleGating.js";

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
