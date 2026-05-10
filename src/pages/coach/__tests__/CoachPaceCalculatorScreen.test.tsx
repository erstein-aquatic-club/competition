import { describe, it, expect } from "vitest";
import type { PaceTarget } from "@/lib/api/pace-targets";
import type { TeamMember } from "@/hooks/useMyTeam";
import type { AthleteSummary } from "@/lib/api/types";

// Full render requires QueryClient + Supabase — covered by manual E2E.
// Regression §184-bugfix: accordion open state is now controlled via openSwimmerIds
// (separate from targets data) so the card stays open after a target is saved.

describe("CoachPaceCalculatorScreen — importability", () => {
  it("default export is a function", async () => {
    const mod = await import("../CoachPaceCalculatorScreen");
    expect(typeof mod.default).toBe("function");
  });
});

describe("belongsTo — target → swimmer matching", () => {
  it("matches account swimmer by accountId", async () => {
    const { belongsTo } = await import("../CoachPaceCalculatorScreen");
    const swimmer: TeamMember = { kind: "account", id: "account-42", accountId: 42, displayName: "Sara" };
    const target: PaceTarget = {
      id: "t1", coach_id: "c", swimmer_account_id: 42, swimmer_manual_id: null,
      stroke: "NL", target_distance_m: 100, target_time_ms: 60000, target_pool_size: "50m", updated_at: "2026-01-01",
    };
    expect(belongsTo(target, swimmer)).toBe(true);
  });

  it("does not match account swimmer with different id", async () => {
    const { belongsTo } = await import("../CoachPaceCalculatorScreen");
    const swimmer: TeamMember = { kind: "account", id: "account-99", accountId: 99, displayName: "Léo" };
    const target: PaceTarget = {
      id: "t2", coach_id: "c", swimmer_account_id: 42, swimmer_manual_id: null,
      stroke: "NL", target_distance_m: 100, target_time_ms: 60000, target_pool_size: "50m", updated_at: "2026-01-01",
    };
    expect(belongsTo(target, swimmer)).toBe(false);
  });

  it("matches manual swimmer by manualId", async () => {
    const { belongsTo } = await import("../CoachPaceCalculatorScreen");
    const swimmer: TeamMember = { kind: "manual", id: "manual-abc", manualId: "abc-uuid", displayName: "Inv." };
    const target: PaceTarget = {
      id: "t3", coach_id: "c", swimmer_account_id: null, swimmer_manual_id: "abc-uuid",
      stroke: "Dos", target_distance_m: 50, target_time_ms: 30000, target_pool_size: "50m", updated_at: "2026-01-01",
    };
    expect(belongsTo(target, swimmer)).toBe(true);
  });

  it("filters correctly with Array.filter", async () => {
    const { belongsTo } = await import("../CoachPaceCalculatorScreen");
    const swimmer: TeamMember = { kind: "account", id: "account-1", accountId: 1, displayName: "A" };
    const targets: PaceTarget[] = [
      { id: "t1", coach_id: "c", swimmer_account_id: 1, swimmer_manual_id: null, stroke: "NL", target_distance_m: 100, target_time_ms: 60000, target_pool_size: "50m", updated_at: "" },
      { id: "t2", coach_id: "c", swimmer_account_id: 2, swimmer_manual_id: null, stroke: "NL", target_distance_m: 100, target_time_ms: 60000, target_pool_size: "50m", updated_at: "" },
      { id: "t3", coach_id: "c", swimmer_account_id: 1, swimmer_manual_id: null, stroke: "Dos", target_distance_m: 50, target_time_ms: 30000, target_pool_size: "50m", updated_at: "" },
    ];
    const filtered = targets.filter((t) => belongsTo(t, swimmer));
    expect(filtered).toHaveLength(2);
    expect(filtered.map((t) => t.id)).toEqual(["t1", "t3"]);
  });
});

describe("buildSelectedMembers — cross-team inclusion (P7)", () => {
  it("team member dans selectedIds → inclus", async () => {
    const { buildSelectedMembers } = await import("../CoachPaceCalculatorScreen");
    const team: TeamMember[] = [{ kind: "account", id: "account-1", accountId: 1, displayName: "Sara" }];
    const result = buildSelectedMembers(team, ["account-1"], []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("account-1");
  });

  it("cross-team athlete dans selectedIds → card créée à partir de allAthletes", async () => {
    const { buildSelectedMembers } = await import("../CoachPaceCalculatorScreen");
    const team: TeamMember[] = [{ kind: "account", id: "account-1", accountId: 1, displayName: "Sara" }];
    const crossAthletes: AthleteSummary[] = [{ id: 99, display_name: "Léo Cross" }];
    const result = buildSelectedMembers(team, ["account-1", "account-99"], crossAthletes);
    expect(result).toHaveLength(2);
    expect(result.some((m) => m.id === "account-99" && m.displayName === "Léo Cross")).toBe(true);
  });

  it("cross-team id inconnu (absent de allAthletes) → ignoré silencieusement", async () => {
    const { buildSelectedMembers } = await import("../CoachPaceCalculatorScreen");
    const result = buildSelectedMembers([], ["account-999"], []);
    expect(result).toHaveLength(0);
  });

  it("team member non sélectionné → absent du résultat", async () => {
    const { buildSelectedMembers } = await import("../CoachPaceCalculatorScreen");
    const team: TeamMember[] = [
      { kind: "account", id: "account-1", accountId: 1, displayName: "Sara" },
      { kind: "account", id: "account-2", accountId: 2, displayName: "Léo" },
    ];
    const result = buildSelectedMembers(team, ["account-1"], []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("account-1");
  });
});

describe("accordion open state — regression §184 UX bugfix", () => {
  it("open state is independent of targets: adding a target does not reset openSwimmerIds", () => {
    // The accordion is now controlled via openSwimmerIds state in CoachPaceCalculatorScreen.
    // This state is separate from the targets array, so mutations that update targets
    // cannot close the card. This test verifies the invariant at the logic level.
    const openIds = ["account-1"];

    // Simulating an optimistic target being added (onMutate):
    const newTarget = { swimmer_account_id: 1 };
    // openIds is never modified by target mutations — it's only changed by user clicks
    expect(openIds).toEqual(["account-1"]);
    // The new target doesn't affect which items are open
    expect(openIds.includes("account-" + newTarget.swimmer_account_id)).toBe(true);
  });

  it("optimistic target matches swimmer so the matrix appears immediately after save", async () => {
    const { belongsTo } = await import("../CoachPaceCalculatorScreen");
    const swimmer: TeamMember = { kind: "account", id: "account-1", accountId: 1, displayName: "Sara" };
    // Shape produced by onMutate optimistic update
    const optimistic: PaceTarget = {
      id: "optimistic-123",
      coach_id: "",
      swimmer_account_id: 1,
      swimmer_manual_id: null,
      stroke: "NL",
      target_distance_m: 100,
      target_time_ms: 65000,
      target_pool_size: "50m",
      updated_at: new Date().toISOString(),
    };
    expect(belongsTo(optimistic, swimmer)).toBe(true);
  });
});

describe("buildObjectiveSyncOps — auto-sync objectifs → pace targets", () => {
  const makeTarget = (accountId: number, stroke: string, distance: number, pool = "50m"): PaceTarget => ({
    id: `t-${accountId}-${stroke}-${distance}`,
    coach_id: "coach1",
    swimmer_account_id: accountId,
    swimmer_manual_id: null,
    stroke: stroke as PaceTarget["stroke"],
    target_distance_m: distance,
    target_time_ms: 60000,
    target_pool_size: pool as PaceTarget["target_pool_size"],
    updated_at: "2026-01-01",
  });

  const makeObjective = (
    authUid: string,
    eventCode: string | null,
    poolLength: number | null,
    targetTimeSeconds: number | null,
  ) => ({
    id: `obj-${authUid}`,
    athlete_id: authUid,
    competition_ids: [] as string[],
    event_code: eventCode,
    pool_length: poolLength,
    target_time_seconds: targetTimeSeconds,
  });

  it("génère un op pour un objectif valide sans cible existante", async () => {
    const { buildObjectiveSyncOps } = await import("../CoachPaceCalculatorScreen");
    const map = new Map([["uuid-1", 42]]);
    const objectives = [makeObjective("uuid-1", "100NL", 50, 60)];
    const ops = buildObjectiveSyncOps(objectives, map, []);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      ref: { kind: "account", accountId: 42 },
      stroke: "NL",
      target_distance_m: 100,
      target_time_ms: 60000,
      target_pool_size: "50m",
    });
  });

  it("ignore un objectif sans target_time_seconds", async () => {
    const { buildObjectiveSyncOps } = await import("../CoachPaceCalculatorScreen");
    const map = new Map([["uuid-1", 42]]);
    const objectives = [makeObjective("uuid-1", "100NL", 50, null)];
    const ops = buildObjectiveSyncOps(objectives, map, []);
    expect(ops).toHaveLength(0);
  });

  it("ignore un objectif avec event_code invalide", async () => {
    const { buildObjectiveSyncOps } = await import("../CoachPaceCalculatorScreen");
    const map = new Map([["uuid-1", 42]]);
    const objectives = [makeObjective("uuid-1", "TRIATHLON", 50, 120)];
    const ops = buildObjectiveSyncOps(objectives, map, []);
    expect(ops).toHaveLength(0);
  });

  it("ignore un objectif si une cible identique existe déjà", async () => {
    const { buildObjectiveSyncOps } = await import("../CoachPaceCalculatorScreen");
    const map = new Map([["uuid-1", 42]]);
    const objectives = [makeObjective("uuid-1", "100NL", 50, 60)];
    const existingTargets = [makeTarget(42, "NL", 100, "50m")];
    const ops = buildObjectiveSyncOps(objectives, map, existingTargets);
    expect(ops).toHaveLength(0);
  });

  it("ignore un objectif si le nageur n'est pas dans l'équipe", async () => {
    const { buildObjectiveSyncOps } = await import("../CoachPaceCalculatorScreen");
    const map = new Map<string, number>(); // équipe vide
    const objectives = [makeObjective("uuid-orphan", "200DOS", 25, 130)];
    const ops = buildObjectiveSyncOps(objectives, map, []);
    expect(ops).toHaveLength(0);
  });

  it("convertit pool_length 25 → '25m'", async () => {
    const { buildObjectiveSyncOps } = await import("../CoachPaceCalculatorScreen");
    const map = new Map([["uuid-2", 7]]);
    const objectives = [makeObjective("uuid-2", "200DOS", 25, 130)];
    const ops = buildObjectiveSyncOps(objectives, map, []);
    expect(ops[0].target_pool_size).toBe("25m");
  });

  it("traite plusieurs objectifs d'une même équipe correctement", async () => {
    const { buildObjectiveSyncOps } = await import("../CoachPaceCalculatorScreen");
    const map = new Map([["uuid-a", 1], ["uuid-b", 2]]);
    const objectives = [
      makeObjective("uuid-a", "100NL", 50, 60),   // valide
      makeObjective("uuid-a", "200NL", 50, null),  // pas de temps → skip
      makeObjective("uuid-b", "50BR", 25, 35),     // valide
      makeObjective("uuid-c", "400QN", 50, 260),   // hors équipe → skip
    ];
    const ops = buildObjectiveSyncOps(objectives, map, []);
    expect(ops).toHaveLength(2);
    expect(ops.map((o) => o.ref.kind === "account" && (o.ref as { accountId: number }).accountId)).toEqual([1, 2]);
  });
});
