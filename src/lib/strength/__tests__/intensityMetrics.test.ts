import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INTENSITY_METRICS, formatIntensity, type IntensityMetric } from "@/lib/strength/intensityMetrics";

describe("intensityMetrics (§298)", () => {
  it("expose les 4 métriques avec config cohérente", () => {
    const keys = Object.keys(INTENSITY_METRICS).sort();
    assert.deepEqual(keys, ["distance_cm", "height_cm", "time_s", "weight_kg"]);
  });

  it("seul weight_kg tracksOneRm + hasBodyweight", () => {
    assert.equal(INTENSITY_METRICS.weight_kg.tracksOneRm, true);
    assert.equal(INTENSITY_METRICS.weight_kg.hasBodyweight, true);
    for (const m of ["height_cm", "distance_cm", "time_s"] as IntensityMetric[]) {
      assert.equal(INTENSITY_METRICS[m].tracksOneRm, false, `${m} tracksOneRm`);
      assert.equal(INTENSITY_METRICS[m].hasBodyweight, false, `${m} hasBodyweight`);
    }
  });

  it("formatIntensity rend valeur + unité", () => {
    assert.equal(formatIntensity(75, "weight_kg"), "75 kg");
    assert.equal(formatIntensity(60, "height_cm"), "60 cm");
    assert.equal(formatIntensity(180, "distance_cm"), "180 cm");
    assert.equal(formatIntensity(30, "time_s"), "30 s");
  });

  it("formatIntensity rend — pour null/0", () => {
    assert.equal(formatIntensity(null, "height_cm"), "—");
    assert.equal(formatIntensity(0, "height_cm"), "—");
    assert.equal(formatIntensity(undefined, "weight_kg"), "—");
  });
});
