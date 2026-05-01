import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Accordion } from "@/components/ui/accordion";
import { SwimmerPaceCard, getInitials, buildSwimmerRef } from "../SwimmerPaceCard";
import { DEFAULT_ZONES } from "../../../../lib/paceCalculator";
import type { TeamMember } from "../../../../hooks/useMyTeam";
import type { PaceTarget } from "../../../../lib/api/pace-targets";

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
        zones: DEFAULT_ZONES,
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
    // Render with accordion open so AccordionContent is in the DOM
    const html = renderCard(accountSwimmer, targets, true);
    // Each target card shows its label in content: "NL 100 m", "Dos 50 m", "Brasse 200 m"
    assert.ok(html.includes("NL"), "NL target label present");
    assert.ok(html.includes("Dos"), "Dos target label present");
    assert.ok(html.includes("Brasse"), "Brasse target label present");
    // Count badge in trigger
    assert.ok(html.includes("3 cibles"), "count badge shows 3");
  });

  it("zero targets shows no count badge", () => {
    const html = renderCard(accountSwimmer, []);
    assert.ok(!html.includes("cible"), "no badge with 0 targets");
  });
});
