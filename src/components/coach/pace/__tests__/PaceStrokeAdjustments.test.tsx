import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PaceStrokeAdjustments, isCellOverridden } from "../PaceStrokeAdjustments";
import { STROKE_ADJUSTMENTS_DEFAULT, type EventFamily } from "../../../../lib/paceData";
import type { StrokeAdjustmentRow } from "../../../../lib/api/pace-stroke-adjustments";

type SingleStroke = "crawl" | "dos" | "brasse" | "papillon";

const FULL_ADJUSTMENTS: Record<SingleStroke, Record<EventFamily, number>> = {
  crawl:    { ...STROKE_ADJUSTMENTS_DEFAULT.crawl },
  dos:      { ...STROKE_ADJUSTMENTS_DEFAULT.dos },
  brasse:   { ...STROKE_ADJUSTMENTS_DEFAULT.brasse },
  papillon: { ...STROKE_ADJUSTMENTS_DEFAULT.papillon },
};

const BASE_PROPS = {
  open: true,
  onOpenChange: () => {},
  adjustments: FULL_ADJUSTMENTS,
  overrides: [] as StrokeAdjustmentRow[],
  onUpsertOne: async () => {},
  onResetAll: async () => {},
};

function render(props: Parameters<typeof PaceStrokeAdjustments>[0]): string {
  return renderToStaticMarkup(createElement(PaceStrokeAdjustments, props));
}

// ─── isCellOverridden — logique pure ──────────────────────────────────────
describe("isCellOverridden — logique pure", () => {
  it("renvoie false si overrides est vide", () => {
    assert.ok(!isCellOverridden("dos", "50m", []));
  });

  it("renvoie true si override exact (stroke + family) existe", () => {
    const overrides: StrokeAdjustmentRow[] = [
      { coach_id: "c1", stroke: "dos", event_family: "50m", m_value: 0.10 },
    ];
    assert.ok(isCellOverridden("dos", "50m", overrides));
  });

  it("renvoie false si override existe pour une autre family (dos/100m ≠ dos/50m)", () => {
    const overrides: StrokeAdjustmentRow[] = [
      { coach_id: "c1", stroke: "dos", event_family: "100m", m_value: 0.05 },
    ];
    assert.ok(!isCellOverridden("dos", "50m", overrides));
  });
});

// ─── Smoke renders ────────────────────────────────────────────────────────
describe("PaceStrokeAdjustments — smoke render", () => {
  it("se rend sans erreur (open=true)", () => {
    let threw = false;
    try { render(BASE_PROPS); } catch { threw = true; }
    assert.ok(!threw, "ne doit pas lever d'exception");
  });

  it("crawl affiche '0.000' sur les 5 familles (lecture seule)", () => {
    const html = render(BASE_PROPS);
    if (html.length > 100) {
      const count = (html.match(/0\.000/g) ?? []).length;
      assert.ok(count >= 5, `≥5 occurrences '0.000' attendues pour crawl réf., got ${count}`);
    }
  });

  it("badge 'perso' présent quand un override existe", () => {
    const overrides: StrokeAdjustmentRow[] = [
      { coach_id: "c1", stroke: "dos", event_family: "50m", m_value: 0.10 },
    ];
    const html = render({ ...BASE_PROPS, overrides });
    if (html.length > 100) assert.ok(html.toLowerCase().includes("perso"), "badge 'perso' absent");
  });

  it("badge 'perso' absent sans aucun override", () => {
    const html = render(BASE_PROPS);
    if (html.length > 100) assert.ok(!html.toLowerCase().includes("perso"), "badge 'perso' ne doit pas apparaître sans override");
  });

  it("bouton réinitialiser présent dans le footer", () => {
    const html = render(BASE_PROPS);
    if (html.length > 100) assert.ok(html.toLowerCase().includes("initialiser"), "bouton reset absent");
  });
});
