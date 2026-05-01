import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { mock } from "node:test";

before(async () => {
  mock.module("@/lib/api/pace-stroke-adjustments", {
    namedExports: {
      getMyStrokeAdjustments: async () => [],
      upsertStrokeAdjustment: async () => {},
      resetMyStrokeAdjustments: async () => {},
    },
  });
});

describe("mergeStrokeAdjustments", () => {
  it("sans overrides → retourne les défauts doc §7 exactement", async () => {
    const { mergeStrokeAdjustments } = await import("../useCoachStrokeAdjustments.ts");
    const result = mergeStrokeAdjustments([]);
    // Crawl : tous les mS = 0
    assert.equal(result.crawl["50m"], 0.00);
    assert.equal(result.crawl["100m"], 0.000);
    assert.equal(result.crawl["200m"], 0.000);
    // Dos : 50m=0.06, 100m=0.045, 200m=0.020
    assert.equal(result.dos["50m"], 0.06);
    assert.equal(result.dos["100m"], 0.045);
    assert.equal(result.dos["200m"], 0.020);
    // Brasse : 50m=0.04, 100m=0.035
    assert.equal(result.brasse["50m"], 0.04);
    assert.equal(result.brasse["100m"], 0.035);
    // Papillon : 200m=0.010
    assert.equal(result.papillon["200m"], 0.010);
  });

  it("override dos/50m → remplace la valeur, le reste inchangé", async () => {
    const { mergeStrokeAdjustments } = await import("../useCoachStrokeAdjustments.ts");
    const result = mergeStrokeAdjustments([
      { coach_id: "x", stroke: "dos", event_family: "50m", m_value: 0.09 },
    ]);
    assert.equal(result.dos["50m"], 0.09, "override appliqué");
    assert.equal(result.dos["100m"], 0.045, "valeur non overridée inchangée");
    assert.equal(result.brasse["50m"], 0.04, "autre nage inchangée");
  });

  it("plusieurs overrides indépendants appliqués tous", async () => {
    const { mergeStrokeAdjustments } = await import("../useCoachStrokeAdjustments.ts");
    const result = mergeStrokeAdjustments([
      { coach_id: "x", stroke: "dos", event_family: "50m", m_value: 0.08 },
      { coach_id: "x", stroke: "brasse", event_family: "100m", m_value: 0.05 },
      { coach_id: "x", stroke: "papillon", event_family: "400m", m_value: 0.02 },
    ]);
    assert.equal(result.dos["50m"], 0.08);
    assert.equal(result.brasse["100m"], 0.05);
    assert.equal(result.papillon["400m"], 0.02);
    // Non touchés
    assert.equal(result.crawl["50m"], 0.00);
    assert.equal(result.dos["100m"], 0.045);
  });

  it("override à 0 remplace bien (pas de valeur par défaut imposée)", async () => {
    const { mergeStrokeAdjustments } = await import("../useCoachStrokeAdjustments.ts");
    const result = mergeStrokeAdjustments([
      { coach_id: "x", stroke: "dos", event_family: "50m", m_value: 0 },
    ]);
    assert.equal(result.dos["50m"], 0, "m_value=0 bien appliqué (≠ défaut 0.06)");
  });

  it("ne mutue pas STROKE_ADJUSTMENTS_DEFAULT (isolation)", async () => {
    const { mergeStrokeAdjustments } = await import("../useCoachStrokeAdjustments.ts");
    const { STROKE_ADJUSTMENTS_DEFAULT } = await import("@/lib/paceData.ts");
    mergeStrokeAdjustments([
      { coach_id: "x", stroke: "dos", event_family: "50m", m_value: 0.99 },
    ]);
    assert.equal(STROKE_ADJUSTMENTS_DEFAULT.dos["50m"], 0.06, "défaut original inchangé");
  });
});
