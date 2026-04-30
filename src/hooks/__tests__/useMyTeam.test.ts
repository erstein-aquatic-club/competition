import { describe, it, expect } from "vitest";
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

    expect(accounts).toHaveLength(2);
    expect(m).toHaveLength(1);
    expect(team).toHaveLength(3);
    // alpha sort
    expect(team.map(t => t.displayName)).toEqual(["Alice", "Marc", "Zoé"]);
  });

  it("account members have kind=account and correct accountId", () => {
    const { team } = buildTeam([5], [athlete(5, "Léo")], []);
    expect(team[0].kind).toBe("account");
    expect(team[0].accountId).toBe(5);
    expect(team[0].id).toBe("account-5");
  });

  it("manual members have kind=manual, carry birthdate/sex", () => {
    const m = manual("uuid-1", "Sara", { birthdate: "2010-05-15", sex: "F" });
    const { team } = buildTeam([], [], [m]);
    expect(team[0].kind).toBe("manual");
    expect(team[0].manualId).toBe("uuid-1");
    expect(team[0].id).toBe("manual-uuid-1");
    expect(team[0].birthdate).toBe("2010-05-15");
    expect(team[0].sex).toBe("F");
  });

  it("excludes athletes not in mySwimmerIds", () => {
    const allAthletes = [athlete(1, "Alice"), athlete(2, "Bob")];
    const { accounts } = buildTeam([1], allAthletes, []);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].displayName).toBe("Alice");
  });

  it("returns empty team when both sources are empty", () => {
    const { team, accounts, manuals: m } = buildTeam([], [], []);
    expect(team).toHaveLength(0);
    expect(accounts).toHaveLength(0);
    expect(m).toHaveLength(0);
  });

  it("sort is case-insensitive", () => {
    const { team } = buildTeam(
      [1, 2],
      [athlete(1, "zoé"), athlete(2, "Alice")],
      [],
    );
    expect(team[0].displayName).toBe("Alice");
    expect(team[1].displayName).toBe("zoé");
  });
});
