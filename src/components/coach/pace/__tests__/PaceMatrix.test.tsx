import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PaceMatrix } from "../PaceMatrix";
import { DEFAULT_ZONES } from "../../../../lib/paceCalculator";
import type { ZoneConfig } from "../../../../lib/paceCalculator";

// NL 100m @ 1:00.0 (60000ms) → pace = 60000ms/100m
// zoneTime(50, 60000, 140) = round(60000 * 50 * 140 / 10000) = round(42000) = 42000 → "42.0"
// zoneTime(15, 60000, 140) = round(60000 * 15 * 140 / 10000) = round(12600) = 12600 → "12.6"

describe("PaceMatrix — known input renders zone cells", () => {
  it("renders distance rows and zone times for NL 100m", () => {
    const html = renderToStaticMarkup(
      createElement(PaceMatrix, {
        targetTimeMs: 60_000,
        targetDistanceM: 100,
        stroke: "NL",
        zones: DEFAULT_ZONES,
      })
    );
    // Should contain the distance rows for 100m NL: 15, 25, 50, 75, 100
    assert.ok(html.includes(">15<") || html.includes(">15 <"), "row 15m");
    assert.ok(html.includes(">50<") || html.includes(">50 <"), "row 50m");
    assert.ok(html.includes(">100<") || html.includes(">100 <"), "row 100m");
    // Zone headers V0–Max
    assert.ok(html.includes("V0"), "V0 header");
    assert.ok(html.includes("Max"), "Max header");
    // A known cell: 50m at V0 (140%) = 42.0s
    assert.ok(html.includes("42.0"), "50m V0 = 42.0s");
  });
});

describe("PaceMatrix — unsupported combination shows placeholder", () => {
  it("4N + 50m renders placeholder text (no rows)", () => {
    const html = renderToStaticMarkup(
      createElement(PaceMatrix, {
        targetTimeMs: 30_000,
        targetDistanceM: 50,
        stroke: "4N",
        zones: DEFAULT_ZONES,
      })
    );
    assert.ok(
      html.toLowerCase().includes("non"),
      "placeholder visible"
    );
    assert.ok(!html.includes("<table"), "no table rendered");
  });
});

describe("PaceMatrix — different zones produce different output", () => {
  it("slower zone (higher pct) produces larger time values", () => {
    const slowZones: ZoneConfig = { v0_pct: 160, v1_pct: 150, v2_pct: 130, v3_pct: 120, max_pct: 110 };
    const fastZones: ZoneConfig = { v0_pct: 120, v1_pct: 110, v2_pct: 105, v3_pct: 100, max_pct: 95 };

    const slowHtml = renderToStaticMarkup(
      createElement(PaceMatrix, {
        targetTimeMs: 60_000,
        targetDistanceM: 100,
        stroke: "NL",
        zones: slowZones,
      })
    );
    const fastHtml = renderToStaticMarkup(
      createElement(PaceMatrix, {
        targetTimeMs: 60_000,
        targetDistanceM: 100,
        stroke: "NL",
        zones: fastZones,
      })
    );
    // Outputs differ
    assert.notEqual(slowHtml, fastHtml);
    // slowZones V0 at 50m = round(60000*50*160/10000) = 48000ms → "48.0"
    assert.ok(slowHtml.includes("48.0"), "slow V0 50m = 48.0s");
    // fastZones V0 at 50m = round(60000*50*120/10000) = 36000ms → "36.0"
    assert.ok(fastHtml.includes("36.0"), "fast V0 50m = 36.0s");
  });
});
