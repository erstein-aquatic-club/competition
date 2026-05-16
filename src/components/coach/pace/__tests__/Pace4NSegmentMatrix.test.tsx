import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Pace4NSegmentMatrix } from "../Pace4NSegmentMatrix";
import { STROKE_ADJUSTMENTS_DEFAULT, type EventFamily, type Zone } from "../../../../lib/paceData";

const DEFAULT_ZONES: Record<EventFamily, Partial<Record<Zone, number>>> = {
  "50m":        { V0: 0.70, V1: 0.78, V2: 0.86, V3: 0.94, V4: 0.98,  MAX: 1.00 },
  "100m":       { V0: 0.72, V1: 0.80, V2: 0.88, V3: 0.95, V4: 0.98,  MAX: 1.00 },
  "200m":       { V0: 0.74, V1: 0.82, V2: 0.90, V3: 0.96, V4: 0.985, MAX: 1.00 },
  "400m":       { V0: 0.76, V1: 0.84, V2: 0.91, V3: 0.96,            MAX: 1.00 },
  "800m_1500m": { V0: 0.78, V1: 0.86, V2: 0.92, V3: 0.97,            MAX: 1.00 },
};

function render(props: Parameters<typeof Pace4NSegmentMatrix>[0]): string {
  return renderToStaticMarkup(createElement(Pace4NSegmentMatrix, props));
}

const BASE_PROPS = {
  swimmerSex: "M" as const,
  targetPool: "50m" as const,
  zones: DEFAULT_ZONES,
  strokeAdjustments: STROKE_ADJUSTMENTS_DEFAULT,
};

describe("Pace4NSegmentMatrix — 200 4N", () => {
  it("affiche les conditions course cochées par défaut", () => {
    const html = render({
      ...BASE_PROPS,
      targetTimeMs: 158_000,
      targetDistanceM: 200,
    });
    assert.ok(html.includes("Départ plot"), "case Départ plot absente");
    assert.ok(html.includes("Combinaison"), "case Combinaison absente");
  });

  it("4 sous-matrices visibles (papillon, dos, brasse, crawl)", () => {
    const html = render({
      ...BASE_PROPS,
      targetTimeMs: 158_000,
      targetDistanceM: 200,
    });
    assert.ok(html.toLowerCase().includes("papillon"), "section papillon");
    assert.ok(html.toLowerCase().includes("dos"), "section dos");
    assert.ok(html.toLowerCase().includes("brasse"), "section brasse");
    assert.ok(html.toLowerCase().includes("crawl"), "section crawl");
  });

  it("header segment papillon montre le temps segment ≈ 34.4s", () => {
    const html = render({
      ...BASE_PROPS,
      targetTimeMs: 158_000,
      targetDistanceM: 200,
    });
    // T_pap = 158 * 0.218 = 34.444 → "34.4"
    assert.ok(html.includes("34.4"), `header T_pap=34.4 attendu, html=${html.substring(0, 300)}`);
  });

  it("sous-rangée pap 25m, V0 ≈ 22.2s", () => {
    const html = render({
      ...BASE_PROPS,
      targetTimeMs: 158_000,
      targetDistanceM: 200,
    });
    // tMax_pap_25m ≈ 15.534 → V0 = 15.534/0.70 ≈ 22.19 → "22.2"
    assert.ok(html.includes("22.2"), `V0 pap 25m ≈ 22.2s attendu`);
  });

  it("cumul 100m (pap+dos) ≈ 73.9s = T_pap + T_dos", () => {
    const html = render({
      ...BASE_PROPS,
      targetTimeMs: 158_000,
      targetDistanceM: 200,
    });
    // T_pap=34.444 + T_dos=39.5 = 73.944s → "1:13.9" (> 60s)
    assert.ok(html.includes("1:13.9"), `cumul pap+dos ≈ 1:13.9 attendu`);
  });

  it("cumul 200m (total) = Tobj = 158.0s", () => {
    const html = render({
      ...BASE_PROPS,
      targetTimeMs: 158_000,
      targetDistanceM: 200,
    });
    // compute4NCumulative(200) = 158.0
    assert.ok(html.includes("2:38.0"), `cumul 200=2:38.0 (158s) attendu`);
  });

  it("footer disclaimer présent", () => {
    const html = render({
      ...BASE_PROPS,
      targetTimeMs: 158_000,
      targetDistanceM: 200,
    });
    assert.ok(html.includes("§187"), "footer disclaimer §187 absent");
  });

  it("colonne MAX à 2 décimales", () => {
    const html = render({
      ...BASE_PROPS,
      targetTimeMs: 158_000,
      targetDistanceM: 200,
    });
    // pap 25m, MAX : tMax ≈ 15.534 → "15.53" (2 décimales)
    assert.ok(html.includes(">15.53<"), "MAX pap 25m doit être à 2 décimales (15.53)");
  });
});

describe("Pace4NSegmentMatrix — 400 4N", () => {
  it("segments à 100m (pas 50m) pour 400 4N", () => {
    const html = render({
      ...BASE_PROPS,
      targetTimeMs: 300_000,
      targetDistanceM: 400,
    });
    // Sub-rows should be 50m and 100m (not 25m and 50m)
    assert.ok(html.includes(">100<") || html.includes(">100 <"), "rangée 100m attendue");
    assert.ok(html.includes(">50<") || html.includes(">50 <"), "rangée 50m attendue");
  });

  it("header papillon 400 4N ≈ 68.7s", () => {
    const html = render({
      ...BASE_PROPS,
      targetTimeMs: 300_000,
      targetDistanceM: 400,
    });
    // T_pap_400 = 300 * 0.229 = 68.7 → "1:08.7"
    assert.ok(html.includes("1:08.7"), `header pap 400 4N ≈ 1:08.7 attendu`);
  });
});
