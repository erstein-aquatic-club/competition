import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PaceMatrix } from "../PaceMatrix";
import { STROKE_ADJUSTMENTS_DEFAULT, type EventFamily, type Zone } from "../../../../lib/paceData";

// Default zones built from canonical coefficients
const DEFAULT_ZONES: Record<EventFamily, Partial<Record<Zone, number>>> = {
  "50m":        { V0: 0.70, V1: 0.78, V2: 0.86, V3: 0.94, V4: 0.98,  MAX: 1.00 },
  "100m":       { V0: 0.72, V1: 0.80, V2: 0.88, V3: 0.95, V4: 0.98,  MAX: 1.00 },
  "200m":       { V0: 0.74, V1: 0.82, V2: 0.90, V3: 0.96, V4: 0.985, MAX: 1.00 },
  "400m":       { V0: 0.76, V1: 0.84, V2: 0.91, V3: 0.96,            MAX: 1.00 },
  "800m_1500m": { V0: 0.78, V1: 0.86, V2: 0.92, V3: 0.97,            MAX: 1.00 },
};

const BASE_PROPS = {
  targetPool: "50m" as const,
  swimmerSex: "M" as const,
  zones: DEFAULT_ZONES,
  strokeAdjustments: STROKE_ADJUSTMENTS_DEFAULT,
  v4EnabledForFamily: false,
};

// Helpers
function render(props: Parameters<typeof PaceMatrix>[0]): string {
  return renderToStaticMarkup(createElement(PaceMatrix, props));
}

describe("PaceMatrix v2 — calcul non-linéaire", () => {
  it("50m crawl Tobj=23.62s → cell (25m, V0) = 15.2s", () => {
    // tMax(25) = 23.62 * 0.451 * 1.0 = 10.653 → V0 = 10.653/0.70 = 15.218 → "15.2"
    const html = render({
      ...BASE_PROPS,
      targetTimeMs: 23_620,
      targetDistanceM: 50,
      stroke: "crawl",
    });
    assert.ok(html.includes("15.2"), `expected 15.2, html=${html.substring(0, 400)}`);
  });

  it("50m et 100m → colonne V4 toujours visible", () => {
    for (const D of [50, 100] as const) {
      const html = render({
        ...BASE_PROPS,
        targetTimeMs: D === 50 ? 23_620 : 51_450,
        targetDistanceM: D,
        stroke: "crawl",
        v4EnabledForFamily: false,
      });
      assert.ok(html.includes(">V4<"), `V4 header attendu pour D=${D}`);
    }
  });

  it("400m sans v4EnabledForFamily → colonne V4 absente", () => {
    const html = render({
      ...BASE_PROPS,
      targetTimeMs: 260_000,
      targetDistanceM: 400,
      stroke: "crawl",
      v4EnabledForFamily: false,
    });
    assert.ok(!html.includes(">V4<"), "V4 ne doit pas apparaître pour 400m sans toggle");
  });

  it("400m avec v4EnabledForFamily=true et coefficient custom → V4 présent", () => {
    const zonesWithV4: Record<EventFamily, Partial<Record<Zone, number>>> = {
      ...DEFAULT_ZONES,
      "400m": { ...DEFAULT_ZONES["400m"], V4: 0.975 },
    };
    const html = render({
      ...BASE_PROPS,
      targetTimeMs: 260_000,
      targetDistanceM: 400,
      stroke: "crawl",
      v4EnabledForFamily: true,
      zones: zonesWithV4,
    });
    assert.ok(html.includes(">V4<"), "V4 doit apparaître pour 400m avec toggle activé");
  });

  it("stroke=4N → placeholder visible, pas de tableau", () => {
    const html = render({
      ...BASE_PROPS,
      targetTimeMs: 113_000,
      targetDistanceM: 200,
      stroke: "4N",
    });
    assert.ok(html.toLowerCase().includes("4 nages"), "placeholder 4N visible");
    assert.ok(!html.includes("<table"), "aucun tableau pour 4N");
  });

  it("footer disclaimer modèle v2 présent", () => {
    const html = render({
      ...BASE_PROPS,
      targetTimeMs: 51_450,
      targetDistanceM: 100,
      stroke: "crawl",
    });
    assert.ok(
      html.includes("non-lin") && html.includes("§187"),
      "footer disclaimer v2 absent",
    );
  });

  it("swimmerSex=null → bouton 25m cliquable (conversion moyenne M/F)", () => {
    const html = render({
      ...BASE_PROPS,
      targetTimeMs: 51_450,
      targetDistanceM: 100,
      stroke: "crawl",
      swimmerSex: null,
    });
    // Avec sexe inconnu, on utilise la moyenne M/F → le bouton n'est pas disabled
    assert.ok(!html.includes("cursor-not-allowed"), "bouton 25m ne doit pas être grisé sans sexe");
  });

  it("distance cible (d=D) présente comme ligne dans le tableau", () => {
    const html = render({
      ...BASE_PROPS,
      targetTimeMs: 23_620,
      targetDistanceM: 50,
      stroke: "crawl",
    });
    // 50m row should be in the table body
    assert.ok(html.includes(">50<") || html.includes(">50 <"), "ligne d=50 présente");
  });
});
