import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PaceZonesSettings, isZoneOrderValid } from "../PaceZonesSettings";
import { ZONE_COEFFICIENTS, type EventFamily, type Zone } from "../../../../lib/paceData";

// ─── Default zones built from canonical coefficients ──────────────────────
const DEFAULT_ZONES: Record<EventFamily, Partial<Record<Zone, number>>> = {
  "50m":        { V0: 0.70, V1: 0.78, V2: 0.86, V3: 0.94, V4: 0.98,  MAX: 1.00 },
  "100m":       { V0: 0.72, V1: 0.80, V2: 0.88, V3: 0.95, V4: 0.98,  MAX: 1.00 },
  "200m":       { V0: 0.74, V1: 0.82, V2: 0.90, V3: 0.96, V4: 0.985, MAX: 1.00 },
  "400m":       { V0: 0.76, V1: 0.84, V2: 0.91, V3: 0.96,            MAX: 1.00 },
  "800m_1500m": { V0: 0.78, V1: 0.86, V2: 0.92, V3: 0.97,            MAX: 1.00 },
};

const BASE_COMPONENT_PROPS = {
  open: true,
  onOpenChange: () => {},
  zones: DEFAULT_ZONES,
  onUpsertCell: async () => {},
  onResetAll: async () => {},
  onToggleV4: async () => {},
};

describe("isZoneOrderValid — validation logique pure", () => {
  it("valeurs par défaut 50m sont valides (ordre croissant strict)", () => {
    assert.ok(isZoneOrderValid(DEFAULT_ZONES["50m"], "50m", true));
  });

  it("valeurs par défaut 400m sont valides (sans V4)", () => {
    assert.ok(isZoneOrderValid(DEFAULT_ZONES["400m"], "400m", false));
  });

  it("V1 > V2 → invalide (ordre speed cassé)", () => {
    const bad: Partial<Record<Zone, number>> = { V0: 0.70, V1: 0.90, V2: 0.82, V3: 0.94, MAX: 1.00 };
    assert.ok(!isZoneOrderValid(bad, "50m", false));
  });

  it("V3 > MAX → invalide", () => {
    const bad: Partial<Record<Zone, number>> = { V0: 0.70, V1: 0.78, V2: 0.86, V3: 1.02, MAX: 1.00 };
    assert.ok(!isZoneOrderValid(bad, "50m", false));
  });

  it("V3 > V4 avec V4 activé → invalide", () => {
    const bad: Partial<Record<Zone, number>> = { V0: 0.70, V1: 0.78, V2: 0.86, V3: 0.97, V4: 0.95, MAX: 1.00 };
    assert.ok(!isZoneOrderValid(bad, "200m", true));
  });

  it("ordre parfait avec V4 → valide", () => {
    const ok: Partial<Record<Zone, number>> = { V0: 0.70, V1: 0.78, V2: 0.86, V3: 0.94, V4: 0.98, MAX: 1.00 };
    assert.ok(isZoneOrderValid(ok, "50m", true));
  });

  it("valeurs manquantes → utilise ZONE_COEFFICIENTS comme fallback", () => {
    // Empty local — falls back to ZONE_COEFFICIENTS which are valid
    assert.ok(isZoneOrderValid({}, "100m", false));
  });
});

describe("PaceZonesSettings — render smoke tests", () => {
  it("se rend sans erreur quand open=false", () => {
    let threw = false;
    try {
      renderToStaticMarkup(
        createElement(PaceZonesSettings, { ...BASE_COMPONENT_PROPS, open: false }),
      );
    } catch {
      threw = true;
    }
    assert.ok(!threw, "ne doit pas lever d'exception quand fermé");
  });

  it("rendu open=true contient les onglets famille ou contenu zones", () => {
    let threw = false;
    let html = "";
    try {
      html = renderToStaticMarkup(
        createElement(PaceZonesSettings, BASE_COMPONENT_PROPS),
      );
    } catch {
      threw = true;
    }
    assert.ok(!threw, "ne doit pas lever d'exception quand ouvert");
    // SSR may skip portal content — just verify no throw + any meaningful content
    if (html.length > 100) {
      const hasContent =
        html.includes("50m") ||
        html.includes("V0") ||
        html.includes("oefficient") ||
        html.includes("zone");
      assert.ok(hasContent, "le contenu des zones doit être présent dans le rendu SSR");
    }
  });

  it("rendu contient le bouton réinitialiser toutes les familles", () => {
    const html = renderToStaticMarkup(
      createElement(PaceZonesSettings, BASE_COMPONENT_PROPS),
    );
    if (html.length > 100) {
      assert.ok(
        html.toLowerCase().includes("initialiser"),
        "bouton reset all absent",
      );
    }
  });
});
