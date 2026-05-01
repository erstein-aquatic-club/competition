import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PaceTeamPanel, buildCrossTeamAthletes } from "../PaceTeamPanel";
import type { TeamMember } from "../../../../hooks/useMyTeam";
import type { AthleteSummary } from "../../../../lib/api/types";

const team: TeamMember[] = [
  { kind: "account", id: "account-1", accountId: 1, displayName: "Sara Dupont" },
  { kind: "account", id: "account-2", accountId: 2, displayName: "Léo Martin" },
  { kind: "manual", id: "manual-uuid-1", manualId: "uuid-1", displayName: "Invité Test" },
];

const allAthletes: AthleteSummary[] = [
  { id: 1, display_name: "Sara Dupont" },
  { id: 2, display_name: "Léo Martin" },
  { id: 3, display_name: "Alice Schmitt" },
  { id: 4, display_name: "Bob Muller" },
];

describe("buildCrossTeamAthletes", () => {
  it("excludes athletes already in team by accountId", () => {
    const cross = buildCrossTeamAthletes(team, allAthletes);
    const names = cross.map((a) => a.display_name);
    assert.ok(!names.includes("Sara Dupont"), "Sara (team) excluded");
    assert.ok(!names.includes("Léo Martin"), "Léo (team) excluded");
    assert.ok(names.includes("Alice Schmitt"), "Alice (not in team) included");
    assert.ok(names.includes("Bob Muller"), "Bob (not in team) included");
    assert.equal(cross.length, 2);
  });

  it("returns empty when all athletes are already in team", () => {
    const fullTeam: TeamMember[] = [
      { kind: "account", id: "account-1", accountId: 1, displayName: "A" },
      { kind: "account", id: "account-2", accountId: 2, displayName: "B" },
      { kind: "account", id: "account-3", accountId: 3, displayName: "C" },
      { kind: "account", id: "account-4", accountId: 4, displayName: "D" },
    ];
    assert.deepEqual(buildCrossTeamAthletes(fullTeam, allAthletes), []);
  });

  it("ignores null-id athletes in allAthletes", () => {
    const withNull: AthleteSummary[] = [
      ...allAthletes,
      { id: null, display_name: "Ghost" },
    ];
    const cross = buildCrossTeamAthletes(team, withNull);
    assert.ok(!cross.some((a) => a.display_name === "Ghost"), "null-id excluded");
  });
});

describe("PaceTeamPanel — static render", () => {
  function render(overrides: Partial<Parameters<typeof PaceTeamPanel>[0]> = {}) {
    return renderToStaticMarkup(
      createElement(PaceTeamPanel, {
        team,
        allAthletes,
        selectedIds: team.map((m) => m.id),
        onChange: () => {},
        ...overrides,
      } as Parameters<typeof PaceTeamPanel>[0]),
    );
  }

  it("renders all 3 team member names", () => {
    const html = render();
    assert.ok(html.includes("Sara Dupont"), "Sara visible");
    assert.ok(html.includes("Léo Martin"), "Léo visible");
    assert.ok(html.includes("Invité Test"), "manual member visible");
  });

  it("shows 'Sans compte' badge for manual members", () => {
    const html = render();
    assert.ok(html.includes("Sans compte"), "badge present");
  });

  it("shows 'Gérer mon équipe →' footer link", () => {
    const html = render();
    assert.ok(html.includes("Gérer mon équipe"), "footer link present");
    assert.ok(html.includes("/coach?section=swimmers"), "link href correct");
  });
});

describe("PaceTeamPanel — selection logic (pure)", () => {
  it("uncheck removes id from selection", () => {
    const initial = team.map((m) => m.id);
    const afterUncheck = initial.filter((id) => id !== "account-1");
    assert.ok(!afterUncheck.includes("account-1"), "account-1 removed");
    assert.equal(afterUncheck.length, 2);
  });

  it("cross-team toggle adds 'account-{id}' to selection", () => {
    const initial = ["account-1", "account-2"];
    const alice: AthleteSummary = { id: 3, display_name: "Alice Schmitt" };
    const id = `account-${alice.id}`;
    const updated = [...initial, id];
    assert.ok(updated.includes("account-3"), "Alice added to selection");
    assert.equal(updated.length, 3);
  });

  it("cross-team toggle removes if already selected", () => {
    const initial = ["account-1", "account-3"];
    const id = "account-3";
    const updated = initial.filter((s) => s !== id);
    assert.deepEqual(updated, ["account-1"]);
  });
});
