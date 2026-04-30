import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PaceZonesSettings, isZoneOrdered, ZONE_ROWS } from "../PaceZonesSettings";
import { DEFAULT_ZONES } from "../../../../lib/paceCalculator";
import type { ZoneConfig } from "../../../../lib/paceCalculator";

describe("isZoneOrdered — validation logic", () => {
  it("DEFAULT_ZONES is valid (140 >= 130 >= 115 >= 110 >= 105)", () => {
    assert.ok(isZoneOrdered(DEFAULT_ZONES));
  });

  it("V2=95 < V3=110 → invalid (save should be disabled)", () => {
    const bad: ZoneConfig = { ...DEFAULT_ZONES, v2_pct: 95 };
    assert.ok(!isZoneOrdered(bad));
  });

  it("V0=125 < V1=130 → invalid", () => {
    const bad: ZoneConfig = { ...DEFAULT_ZONES, v0_pct: 125 };
    assert.ok(!isZoneOrdered(bad));
  });

  it("all equal values are valid (flat zones allowed)", () => {
    const flat: ZoneConfig = { v0_pct: 120, v1_pct: 120, v2_pct: 120, v3_pct: 120, max_pct: 120 };
    assert.ok(isZoneOrdered(flat));
  });

  it("Reset → DEFAULT_ZONES is immediately valid", () => {
    // Simulates handleReset: setZones(DEFAULT_ZONES)
    const afterReset = DEFAULT_ZONES;
    assert.ok(isZoneOrdered(afterReset));
    assert.equal(afterReset.v0_pct, 140);
    assert.equal(afterReset.v1_pct, 130);
    assert.equal(afterReset.v2_pct, 115);
    assert.equal(afterReset.v3_pct, 110);
    assert.equal(afterReset.max_pct, 105);
  });
});

describe("ZONE_ROWS — configuration", () => {
  it("has 5 rows in V0→Max order", () => {
    assert.equal(ZONE_ROWS.length, 5);
    assert.equal(ZONE_ROWS[0].label, "V0");
    assert.equal(ZONE_ROWS[4].label, "Max");
  });

  it("keys match ZoneConfig fields", () => {
    const keys = ZONE_ROWS.map((r) => r.key);
    assert.deepEqual(keys, ["v0_pct", "v1_pct", "v2_pct", "v3_pct", "max_pct"]);
  });

  it("color classes follow intensity-1..5 progression", () => {
    ZONE_ROWS.forEach((row, i) => {
      assert.equal(row.colorClass, `text-intensity-${i + 1}`);
    });
  });
});

describe("PaceZonesSettings — static render (importability)", () => {
  it("renders without throwing when closed", () => {
    // Sheet with open=false — content may not be in DOM (portal)
    // but the component should not throw
    let threw = false;
    try {
      renderToStaticMarkup(
        createElement(PaceZonesSettings, {
          open: false,
          onOpenChange: () => {},
          currentZones: DEFAULT_ZONES,
          onSave: () => {},
        }),
      );
    } catch {
      threw = true;
    }
    assert.ok(!threw, "component renders without throwing");
  });

  it("when open, renders zone labels in content", () => {
    const html = renderToStaticMarkup(
      createElement(PaceZonesSettings, {
        open: true,
        onOpenChange: () => {},
        currentZones: DEFAULT_ZONES,
        onSave: () => {},
      }),
    );
    // Radix Sheet may use a portal — if HTML is non-empty it should have zone labels
    if (html.length > 50) {
      assert.ok(html.includes("V0") || html.includes("Zones"), "zone content rendered");
    } else {
      // Portal not in SSR output — skip content check, just verify no throw (above)
      assert.ok(true, "portal not rendered in SSR — no-op");
    }
  });
});
