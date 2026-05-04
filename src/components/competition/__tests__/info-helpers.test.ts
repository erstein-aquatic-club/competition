import { describe, it, expect } from "vitest";
import { computeObjectivePerfRow, groupAndSortAssignments, selectLinkableForCompetition } from "../info-helpers";
import type { Objective, SwimmerPerformance, CompetitionAssignment } from "@/lib/api/types";

const baseObjective = (over: Partial<Objective> = {}): Objective => ({
  id: "o1",
  athlete_id: "a1",
  competition_id: "c1",
  competition_ids: ["c1"],
  event_code: "50_FREE",
  pool_length: 50,
  target_time_seconds: 24.5,
  text: null,
  ...over,
});

const perf = (over: Partial<SwimmerPerformance> = {}): SwimmerPerformance => ({
  id: 1,
  user_id: 1,
  swimmer_iuf: "X",
  event_code: "50_FREE",
  pool_length: 50,
  time_seconds: 24.82,
  competition_date: "2025-12-01",
  ...over,
} as SwimmerPerformance);

describe("computeObjectivePerfRow", () => {
  it("returns label, target, pb and positive delta when PB is above target", () => {
    const row = computeObjectivePerfRow(baseObjective(), [perf()]);
    expect(row.targetSeconds).toBe(24.5);
    expect(row.pbSeconds).toBe(24.82);
    expect(row.deltaSeconds).toBeCloseTo(0.32, 2);
  });

  it("returns negative delta when PB is below target", () => {
    const row = computeObjectivePerfRow(baseObjective(), [perf({ time_seconds: 24.10 })]);
    expect(row.deltaSeconds).toBeCloseTo(-0.40, 2);
  });

  it("returns null pb when no perf matches event_code+poolLength", () => {
    const row = computeObjectivePerfRow(baseObjective(), [perf({ event_code: "100_FREE" })]);
    expect(row.pbSeconds).toBeNull();
    expect(row.deltaSeconds).toBeNull();
  });

  it("picks the minimum (best) time when multiple perfs match", () => {
    const row = computeObjectivePerfRow(baseObjective(), [
      perf({ time_seconds: 25.10 }),
      perf({ time_seconds: 24.55 }),
      perf({ time_seconds: 24.95 }),
    ]);
    expect(row.pbSeconds).toBe(24.55);
  });

  it("returns null target and pb when objective has no target_time_seconds", () => {
    const row = computeObjectivePerfRow(baseObjective({ target_time_seconds: null }), [perf()]);
    expect(row.targetSeconds).toBeNull();
    expect(row.deltaSeconds).toBeNull();
    // pb is still computed because it doesn't depend on target
    expect(row.pbSeconds).toBe(24.82);
  });

  it("respects pool_length when filtering perfs", () => {
    const row = computeObjectivePerfRow(
      baseObjective({ pool_length: 25 }),
      [perf({ pool_length: 50, time_seconds: 24.10 })],
    );
    expect(row.pbSeconds).toBeNull();
  });
});

interface TestProfile {
  user_id: number;
  display_name: string;
  group_label: string | null;
  avatar_url: string | null;
}

describe("groupAndSortAssignments", () => {
  const a = (id: number): CompetitionAssignment => ({
    id,
    competition_id: "c1",
    athlete_id: id,
    assigned_at: null,
  });

  it("sorts by group ASC then name ASC", () => {
    const profiles = new Map<number, TestProfile>([
      [1, { user_id: 1, display_name: "Charlie", group_label: "Compet M", avatar_url: null }],
      [2, { user_id: 2, display_name: "Alice", group_label: "Compet F", avatar_url: null }],
      [3, { user_id: 3, display_name: "Bob", group_label: "Compet F", avatar_url: null }],
    ]);
    const objectivesByAthlete = new Map<number, number>();
    const rows = groupAndSortAssignments(
      [a(1), a(2), a(3)],
      profiles,
      objectivesByAthlete,
    );
    expect(rows.map((r) => r.displayName)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("attaches objectives count from map", () => {
    const profiles = new Map<number, TestProfile>([
      [1, { user_id: 1, display_name: "Alice", group_label: "G1", avatar_url: null }],
    ]);
    const objectivesByAthlete = new Map<number, number>([[1, 3]]);
    const [row] = groupAndSortAssignments([a(1)], profiles, objectivesByAthlete);
    expect(row.objectivesCount).toBe(3);
  });

  it("buckets athletes without group into 'Sans groupe' at the end", () => {
    const profiles = new Map<number, TestProfile>([
      [1, { user_id: 1, display_name: "Alice", group_label: null, avatar_url: null }],
      [2, { user_id: 2, display_name: "Bob", group_label: "G1", avatar_url: null }],
    ]);
    const rows = groupAndSortAssignments([a(1), a(2)], profiles, new Map());
    expect(rows.map((r) => r.groupLabel)).toEqual(["G1", "Sans groupe"]);
  });

  it("skips assignments whose profile is missing", () => {
    const profiles = new Map<number, TestProfile>();
    const rows = groupAndSortAssignments([a(1)], profiles, new Map());
    expect(rows).toEqual([]);
  });
});

describe("selectLinkableForCompetition", () => {
  const obj = (over: Partial<Objective> = {}): Objective => ({
    id: "x",
    athlete_id: "a1",
    competition_id: null,
    competition_ids: [],
    event_code: null,
    pool_length: null,
    target_time_seconds: null,
    text: null,
    ...over,
  });

  it("excludes objectives already linked to the current competition", () => {
    const out = selectLinkableForCompetition(
      [
        obj({ id: "1", competition_ids: ["c1"] }),
        obj({ id: "2", competition_ids: ["c2"] }),
        obj({ id: "3", competition_ids: [] }),
      ],
      "c1",
    );
    expect(out.map((o) => o.id)).toEqual(["2", "3"]);
  });

  it("keeps objectives linked to other competitions", () => {
    const out = selectLinkableForCompetition(
      [obj({ id: "a", competition_ids: ["c2", "c3"] })],
      "c1",
    );
    expect(out.map((o) => o.id)).toEqual(["a"]);
  });

  it("keeps objectives with empty competition_ids", () => {
    const out = selectLinkableForCompetition(
      [obj({ id: "a", competition_ids: [] })],
      "c1",
    );
    expect(out).toHaveLength(1);
  });

  it("returns an empty array when input is empty", () => {
    expect(selectLinkableForCompetition([], "c1")).toEqual([]);
  });

  it("preserves input order", () => {
    const a = obj({ id: "a" });
    const b = obj({ id: "b" });
    const c = obj({ id: "c" });
    expect(selectLinkableForCompetition([a, b, c], "x").map((o) => o.id)).toEqual(["a", "b", "c"]);
  });
});
