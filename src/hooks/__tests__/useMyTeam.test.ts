import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTeam, type TeamMember } from "../useMyTeam";
import type { CoachManualSwimmer } from "@/lib/api/coach-manual-swimmers";

const athlete = (id: number, name: string) => ({
  id,
  display_name: name,
  group_id: 1,
  group_name: "G1",
  birthdate: null as string | null,
  avatar_url: null as string | null,
});

const manual = (id: string, name: string, overrides: Partial<CoachManualSwimmer> = {}): CoachManualSwimmer => ({
  id,
  coach_id: "coach-uuid",
  display_name: name,
  birthdate: null,
  sex: null,
  created_at: "2026-04-30T00:00:00Z",
  ...overrides,
});

describe("buildTeam", () => {
  it("merges account swimmers and manuals, sorted alpha by displayName", () => {
    const mySwimmerIds = [1, 2];
    const allAthletes = [athlete(1, "Zoé"), athlete(2, "Alice"), athlete(3, "Bob")];
    const manuals = [manual("m1", "Marc")];

    const { team, accounts, manuals: m } = buildTeam(mySwimmerIds, allAthletes, manuals);

    assert.equal((accounts).length, 2);
    assert.equal((m).length, 1);
    assert.equal((team).length, 3);
    // alpha sort
    assert.deepEqual(team.map(t => t.displayName), ["Alice", "Marc", "Zoé"]);
  });

  it("account members have kind=account and correct accountId", () => {
    const { team } = buildTeam([5], [athlete(5, "Léo")], []);
    assert.equal(team[0].kind, "account");
    assert.equal(team[0].accountId, 5);
    assert.equal(team[0].id, "account-5");
  });

  it("manual members have kind=manual, carry birthdate/sex", () => {
    const m = manual("uuid-1", "Sara", { birthdate: "2010-05-15", sex: "F" });
    const { team } = buildTeam([], [], [m]);
    assert.equal(team[0].kind, "manual");
    assert.equal(team[0].manualId, "uuid-1");
    assert.equal(team[0].id, "manual-uuid-1");
    assert.equal(team[0].birthdate, "2010-05-15");
    assert.equal(team[0].sex, "F");
  });

  it("excludes athletes not in mySwimmerIds", () => {
    const allAthletes = [athlete(1, "Alice"), athlete(2, "Bob")];
    const { accounts } = buildTeam([1], allAthletes, []);
    assert.equal((accounts).length, 1);
    assert.equal(accounts[0].displayName, "Alice");
  });

  it("returns empty team when both sources are empty", () => {
    const { team, accounts, manuals: m } = buildTeam([], [], []);
    assert.equal((team).length, 0);
    assert.equal((accounts).length, 0);
    assert.equal((m).length, 0);
  });

  it("sort is case-insensitive", () => {
    const { team } = buildTeam(
      [1, 2],
      [athlete(1, "zoé"), athlete(2, "Alice")],
      [],
    );
    assert.equal(team[0].displayName, "Alice");
    assert.equal(team[1].displayName, "zoé");
  });
});
