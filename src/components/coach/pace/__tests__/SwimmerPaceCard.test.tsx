import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Accordion } from "@/components/ui/accordion";
import { SwimmerPaceCard, getInitials, buildSwimmerRef } from "../SwimmerPaceCard";
import { STROKE_ADJUSTMENTS_DEFAULT, type EventFamily, type Zone } from "../../../../lib/paceData";
import type { TeamMember } from "../../../../hooks/useMyTeam";
import type { PaceTarget } from "../../../../lib/api/pace-targets";

const DEFAULT_ZONES_V2: Record<EventFamily, Partial<Record<Zone, number>>> = {
  "50m":        { V0: 0.70, V1: 0.78, V2: 0.86, V3: 0.94, V4: 0.98,  MAX: 1.00 },
  "100m":       { V0: 0.72, V1: 0.80, V2: 0.88, V3: 0.95, V4: 0.98,  MAX: 1.00 },
  "200m":       { V0: 0.74, V1: 0.82, V2: 0.90, V3: 0.96, V4: 0.985, MAX: 1.00 },
  "400m":       { V0: 0.76, V1: 0.84, V2: 0.91, V3: 0.96,            MAX: 1.00 },
  "800m_1500m": { V0: 0.78, V1: 0.86, V2: 0.92, V3: 0.97,            MAX: 1.00 },
};

const DEFAULT_V4_BY_FAMILY: Record<EventFamily, boolean> = {
  "50m": true, "100m": true, "200m": false, "400m": false, "800m_1500m": false,
};

const accountSwimmer: TeamMember = {
  kind: "account",
  id: "account-42",
  accountId: 42,
  displayName: "Sara Dupont",
};

const manualSwimmer: TeamMember = {
  kind: "manual",
  id: "manual-uuid-1",
  manualId: "uuid-1",
  displayName: "Léo Martin",
};

function makeTarget(overrides: Partial<PaceTarget> = {}): PaceTarget {
  return {
    id: "target-1",
    coach_id: "coach-1",
    swimmer_account_id: 42,
    swimmer_manual_id: null,
    stroke: "NL",
    target_distance_m: 100,
    target_time_ms: 60_000,
    target_pool_size: "50m",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderCard(swimmer: TeamMember, targets: PaceTarget[], open = false) {
  return renderToStaticMarkup(
    createElement(
      Accordion,
      { type: "single", collapsible: true, defaultValue: open ? swimmer.id : undefined },
      createElement(SwimmerPaceCard, {
        swimmer,
        targets,
        zones: DEFAULT_ZONES_V2,
        strokeAdjustments: STROKE_ADJUSTMENTS_DEFAULT,
        v4ByFamily: DEFAULT_V4_BY_FAMILY,
        onUpsertTarget: () => {},
        onDeleteTarget: () => {},
        onExportPdf: () => {},
        onShare: async () => ({ url: "https://example.com/#/share/pace/tok" }),
      }),
    ),
  );
}

describe("getInitials", () => {
  it("two-word name → first letters of each part", () => {
    assert.equal(getInitials("Sara Dupont"), "SD");
    assert.equal(getInitials("Léo Martin"), "LM");
  });

  it("single word → first two chars", () => {
    assert.equal(getInitials("Albert"), "AL");
  });

  it("three words → first + last initial", () => {
    assert.equal(getInitials("Jean Pierre Dupont"), "JD");
  });
});

describe("buildSwimmerRef", () => {
  it("account swimmer → { kind: 'account', accountId }", () => {
    const ref = buildSwimmerRef(accountSwimmer);
    assert.deepEqual(ref, { kind: "account", accountId: 42 });
  });

  it("manual swimmer → { kind: 'manual', manualId }", () => {
    const ref = buildSwimmerRef(manualSwimmer);
    assert.deepEqual(ref, { kind: "manual", manualId: "uuid-1" });
  });
});

describe("SwimmerPaceCard — static render", () => {
  it("renders swimmer displayName in trigger", () => {
    const html = renderCard(accountSwimmer, []);
    assert.ok(html.includes("Sara Dupont"), "name in trigger");
  });

  it("shows 'Sans compte' badge for manual swimmer", () => {
    const html = renderCard(manualSwimmer, []);
    assert.ok(html.includes("Sans compte"), "'Sans compte' badge present");
  });

  it("N targets → N formatTargetLabel markers in HTML (open=true)", () => {
    const targets = [
      makeTarget({ id: "t1", stroke: "NL", target_distance_m: 100 }),
      makeTarget({ id: "t2", stroke: "Dos", target_distance_m: 50 }),
      makeTarget({ id: "t3", stroke: "Brasse", target_distance_m: 200 }),
    ];
    const html = renderCard(accountSwimmer, targets, true);
    assert.ok(html.includes("NL"), "NL target label present");
    assert.ok(html.includes("Dos"), "Dos target label present");
    assert.ok(html.includes("Brasse"), "Brasse target label present");
    assert.ok(html.includes("3 cibles"), "count badge shows 3");
  });

  it("zero targets shows no count badge", () => {
    const html = renderCard(accountSwimmer, []);
    assert.ok(!html.includes("cible"), "no badge with 0 targets");
  });
});

describe("SwimmerPaceCard — trigger design P6 (distance + stroke + time)", () => {
  it("trigger contient distance, stroke et temps formaté (open=true)", () => {
    const targets = [makeTarget({ id: "t1", stroke: "NL", target_distance_m: 100, target_time_ms: 60_000 })];
    const html = renderCard(accountSwimmer, targets, true);
    assert.ok(html.includes("100m"), "distance '100m' présente dans le trigger");
    assert.ok(html.includes("NL"), "badge stroke 'NL' présent");
    assert.ok(html.includes("1:00.0"), "temps '1:00.0' présent dans la pill mono");
  });

  it("badge NL porte une classe 'blue'", () => {
    const targets = [makeTarget({ id: "t1", stroke: "NL", target_distance_m: 100 })];
    const html = renderCard(accountSwimmer, targets, true);
    assert.ok(html.includes("blue"), "classe blue appliquée au badge NL");
  });

  it("distance 1500m formatée en '1.5km'", () => {
    const targets = [makeTarget({ id: "t1", stroke: "NL", target_distance_m: 1500 })];
    const html = renderCard(accountSwimmer, targets, true);
    assert.ok(html.includes("1.5km"), "distance ≥1000m formatée en km");
  });
});
