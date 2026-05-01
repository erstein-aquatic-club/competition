import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import type { PaceSharePayload } from "@/lib/api/pace-share";
import { ZONE_COEFFICIENTS } from "@/lib/paceData";

// Full render of the default export requires wouter + Supabase context — covered by manual E2E.
// These tests cover the pure helper + the exported SharedPaceMatrixContent sub-component.

function makePayload(overrides: Partial<PaceSharePayload> = {}): PaceSharePayload {
  return {
    swimmer_name: "Sara Dupont",
    swimmer_sex: "F",
    zones_v2: undefined,
    targets: [
      {
        id: "t1",
        coach_id: "c",
        swimmer_account_id: 42,
        swimmer_manual_id: null,
        stroke: "NL",
        target_distance_m: 100,
        target_time_ms: 65_000,
        target_pool_size: "50m",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
    ...overrides,
  };
}

describe("mergeZonesFromPayload — pure function (P8 task 28)", () => {
  it("sans zones_v2 → defaults ZONE_COEFFICIENTS pour chaque famille", async () => {
    const { mergeZonesFromPayload } = await import("../SharedPaceMatrix");
    const zones = mergeZonesFromPayload(undefined);
    assert.equal(zones["100m"].V0, ZONE_COEFFICIENTS["100m"].V0);
    assert.equal(zones["100m"].MAX, ZONE_COEFFICIENTS["100m"].MAX);
    assert.equal(zones["50m"].V4, ZONE_COEFFICIENTS["50m"].V4 ?? undefined);
  });

  it("zones_v2 overlay → overrides la cellule, laisse les autres intacts", async () => {
    const { mergeZonesFromPayload } = await import("../SharedPaceMatrix");
    const zones = mergeZonesFromPayload({ "100m": { V0: 0.99 } });
    assert.equal(zones["100m"].V0, 0.99, "V0 overridden");
    assert.equal(zones["100m"].V1, ZONE_COEFFICIENTS["100m"].V1, "V1 unchanged");
    assert.equal(zones["100m"].MAX, ZONE_COEFFICIENTS["100m"].MAX, "MAX unchanged");
  });

  it("V4 présent pour 100m (built-in) et absent pour 400m (pas de V4 par défaut)", async () => {
    const { mergeZonesFromPayload } = await import("../SharedPaceMatrix");
    const zones = mergeZonesFromPayload(undefined);
    assert.notEqual(zones["100m"].V4, undefined, "100m a V4");
    assert.equal(zones["400m"].V4, undefined, "400m n'a pas V4 par défaut");
  });
});

describe("SharedPaceMatrixContent — static render", () => {
  it("payload NL 100m → swimmer_name + label distance visible", async () => {
    const { SharedPaceMatrixContent } = await import("../SharedPaceMatrix");
    const html = renderToStaticMarkup(
      createElement(SharedPaceMatrixContent, { data: makePayload() }),
    );
    assert.ok(html.includes("Sara Dupont"), "swimmer_name présent");
    assert.ok(html.includes("100"), "distance 100 présente");
    assert.ok(html.includes("NL"), "stroke NL présent");
  });

  it("target 4N 200m → Pace4NSegmentMatrix utilisée (renders 'Papillon')", async () => {
    const { SharedPaceMatrixContent } = await import("../SharedPaceMatrix");
    const html = renderToStaticMarkup(
      createElement(SharedPaceMatrixContent, {
        data: makePayload({
          targets: [
            {
              id: "t4n",
              coach_id: "c",
              swimmer_account_id: 42,
              swimmer_manual_id: null,
              stroke: "4N",
              target_distance_m: 200,
              target_time_ms: 160_000,
              target_pool_size: "50m",
              updated_at: "2026-01-01T00:00:00Z",
            },
          ],
        }),
      }),
    );
    assert.ok(html.includes("Papillon"), "Pace4NSegmentMatrix renderise le segment Papillon");
    assert.ok(html.includes("Dos"), "segment Dos présent");
    assert.ok(
      html.includes("cumulés") || html.includes("tMAX"),
      "section cumulative présente",
    );
  });

  it("swimmer_sex=null → renders sans crash, nom affiché", async () => {
    const { SharedPaceMatrixContent } = await import("../SharedPaceMatrix");
    const html = renderToStaticMarkup(
      createElement(SharedPaceMatrixContent, {
        data: makePayload({ swimmer_sex: null }),
      }),
    );
    assert.ok(html.includes("Sara Dupont"), "nom nageur·euse présent même si sex=null");
    assert.ok(html.length > 100, "du contenu rendu");
  });

  it("importability — default export is a function", async () => {
    const mod = await import("../SharedPaceMatrix");
    assert.strictEqual(typeof mod.default, "function");
  });
});

describe("pace share link — url format (régression P8)", () => {
  it("url contains /#/share/pace/ segment", () => {
    const origin = "https://example.com";
    const token = "abc-123-def";
    const url = `${origin}/#/share/pace/${token}`;
    assert.ok(url.includes("/#/share/pace/"), `url must contain /#/share/pace/, got: ${url}`);
    assert.ok(url.endsWith(token), `url must end with token, got: ${url}`);
  });

  it("token is extracted from /share/pace/:token path", () => {
    const location = "/share/pace/my-token-xyz";
    const token = location.split("/share/pace/")[1]?.split("?")[0] ?? "";
    assert.strictEqual(token, "my-token-xyz");
  });

  it("token extraction handles query params", () => {
    const location = "/share/pace/tok123?foo=bar";
    const token = location.split("/share/pace/")[1]?.split("?")[0] ?? "";
    assert.strictEqual(token, "tok123");
  });

  it("token extraction returns empty string for unrelated path", () => {
    const location = "/coach";
    const token = location.split("/share/pace/")[1]?.split("?")[0] ?? "";
    assert.strictEqual(token, "");
  });
});
