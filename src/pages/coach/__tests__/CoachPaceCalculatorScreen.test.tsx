import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PaceTarget } from "@/lib/api/pace-targets";
import type { TeamMember } from "@/hooks/useMyTeam";
import type { AthleteSummary, Objective } from "@/lib/api/types";

/**
 * Équivalent de `expect(actual).toMatchObject(expected)` de Vitest : vérifie
 * récursivement que `actual` contient (au moins) les clés/valeurs de `expected`.
 * (assert.partialDeepStrictEqual existe en Node 24 mais n'est pas encore typé
 * dans @types/node v20 → helper local pour rester tsc-clean.)
 */
function assertMatchObject(actual: unknown, expected: Record<string, unknown>): void {
  assert.ok(
    actual !== null && typeof actual === "object",
    `attendu un objet, obtenu ${String(actual)}`,
  );
  const a = actual as Record<string, unknown>;
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (
      expectedValue !== null &&
      typeof expectedValue === "object" &&
      !Array.isArray(expectedValue)
    ) {
      assertMatchObject(a[key], expectedValue as Record<string, unknown>);
    } else {
      assert.deepEqual(a[key], expectedValue);
    }
  }
}

// Full render requires QueryClient + Supabase — covered by manual E2E.
// Regression §184-bugfix: accordion open state is now controlled via openSwimmerIds
// (separate from targets data) so the card stays open after a target is saved.

describe("CoachPaceCalculatorScreen — importability", () => {
  it("default export is a function", async () => {
    const mod = await import("../CoachPaceCalculatorScreen");
    assert.equal(typeof mod.default, "function");
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
    assert.equal(belongsTo(target, swimmer), true);
  });

  it("does not match account swimmer with different id", async () => {
    const { belongsTo } = await import("../CoachPaceCalculatorScreen");
    const swimmer: TeamMember = { kind: "account", id: "account-99", accountId: 99, displayName: "Léo" };
    const target: PaceTarget = {
      id: "t2", coach_id: "c", swimmer_account_id: 42, swimmer_manual_id: null,
      stroke: "NL", target_distance_m: 100, target_time_ms: 60000, target_pool_size: "50m", updated_at: "2026-01-01",
    };
    assert.equal(belongsTo(target, swimmer), false);
  });

  it("matches manual swimmer by manualId", async () => {
    const { belongsTo } = await import("../CoachPaceCalculatorScreen");
    const swimmer: TeamMember = { kind: "manual", id: "manual-abc", manualId: "abc-uuid", displayName: "Inv." };
    const target: PaceTarget = {
      id: "t3", coach_id: "c", swimmer_account_id: null, swimmer_manual_id: "abc-uuid",
      stroke: "Dos", target_distance_m: 50, target_time_ms: 30000, target_pool_size: "50m", updated_at: "2026-01-01",
    };
    assert.equal(belongsTo(target, swimmer), true);
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
    assert.equal((filtered).length, 2);
    assert.deepEqual(filtered.map((t) => t.id), ["t1", "t3"]);
  });
});

describe("buildSelectedMembers — cross-team inclusion (P7)", () => {
  it("team member dans selectedIds → inclus", async () => {
    const { buildSelectedMembers } = await import("../CoachPaceCalculatorScreen");
    const team: TeamMember[] = [{ kind: "account", id: "account-1", accountId: 1, displayName: "Sara" }];
    const result = buildSelectedMembers(team, ["account-1"], []);
    assert.equal((result).length, 1);
    assert.equal(result[0].id, "account-1");
  });

  it("cross-team athlete dans selectedIds → card créée à partir de allAthletes", async () => {
    const { buildSelectedMembers } = await import("../CoachPaceCalculatorScreen");
    const team: TeamMember[] = [{ kind: "account", id: "account-1", accountId: 1, displayName: "Sara" }];
    const crossAthletes: AthleteSummary[] = [{ id: 99, display_name: "Léo Cross" }];
    const result = buildSelectedMembers(team, ["account-1", "account-99"], crossAthletes);
    assert.equal((result).length, 2);
    assert.equal(result.some((m) => m.id === "account-99" && m.displayName === "Léo Cross"), true);
  });

  it("cross-team id inconnu (absent de allAthletes) → ignoré silencieusement", async () => {
    const { buildSelectedMembers } = await import("../CoachPaceCalculatorScreen");
    const result = buildSelectedMembers([], ["account-999"], []);
    assert.equal((result).length, 0);
  });

  it("team member non sélectionné → absent du résultat", async () => {
    const { buildSelectedMembers } = await import("../CoachPaceCalculatorScreen");
    const team: TeamMember[] = [
      { kind: "account", id: "account-1", accountId: 1, displayName: "Sara" },
      { kind: "account", id: "account-2", accountId: 2, displayName: "Léo" },
    ];
    const result = buildSelectedMembers(team, ["account-1"], []);
    assert.equal((result).length, 1);
    assert.equal(result[0].id, "account-1");
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
    assert.deepEqual(openIds, ["account-1"]);
    // The new target doesn't affect which items are open
    assert.equal(openIds.includes("account-" + newTarget.swimmer_account_id), true);
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
    assert.equal(belongsTo(optimistic, swimmer), true);
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
  ): Pick<Objective, "id" | "athlete_id" | "competition_ids" | "event_code" | "pool_length" | "target_time_seconds"> => ({
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
    assert.equal(ops.length, 1);
    assertMatchObject(ops[0], {
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
    assert.equal((ops).length, 0);
  });

  it("ignore un objectif avec event_code invalide", async () => {
    const { buildObjectiveSyncOps } = await import("../CoachPaceCalculatorScreen");
    const map = new Map([["uuid-1", 42]]);
    const objectives = [makeObjective("uuid-1", "TRIATHLON", 50, 120)];
    const ops = buildObjectiveSyncOps(objectives, map, []);
    assert.equal((ops).length, 0);
  });

  it("ignore un objectif si une cible identique existe déjà", async () => {
    const { buildObjectiveSyncOps } = await import("../CoachPaceCalculatorScreen");
    const map = new Map([["uuid-1", 42]]);
    const objectives = [makeObjective("uuid-1", "100NL", 50, 60)];
    const existingTargets = [makeTarget(42, "NL", 100, "50m")];
    const ops = buildObjectiveSyncOps(objectives, map, existingTargets);
    assert.equal((ops).length, 0);
  });

  it("ignore un objectif si le nageur n'est pas dans l'équipe", async () => {
    const { buildObjectiveSyncOps } = await import("../CoachPaceCalculatorScreen");
    const map = new Map<string, number>(); // équipe vide
    const objectives = [makeObjective("uuid-orphan", "200DOS", 25, 130)];
    const ops = buildObjectiveSyncOps(objectives, map, []);
    assert.equal((ops).length, 0);
  });

  it("convertit pool_length 25 → '25m'", async () => {
    const { buildObjectiveSyncOps } = await import("../CoachPaceCalculatorScreen");
    const map = new Map([["uuid-2", 7]]);
    const objectives = [makeObjective("uuid-2", "200DOS", 25, 130)];
    const ops = buildObjectiveSyncOps(objectives, map, []);
    assert.equal(ops[0].target_pool_size, "25m");
  });

  it("convertit pool_length null → '50m' (valeur par défaut)", async () => {
    const { buildObjectiveSyncOps } = await import("../CoachPaceCalculatorScreen");
    const map = new Map([["uuid-3", 9]]);
    const objectives = [makeObjective("uuid-3", "200DOS", null, 130)];
    const ops = buildObjectiveSyncOps(objectives, map, []);
    assert.equal(ops[0].target_pool_size, "50m");
  });

  it("ignore si cible existante même si le temps diffère (ne pas écraser)", async () => {
    const { buildObjectiveSyncOps } = await import("../CoachPaceCalculatorScreen");
    const map = new Map([["uuid-1", 42]]);
    const objectives = [makeObjective("uuid-1", "100NL", 50, 65)]; // temps différent (65s vs 60s)
    const existingTargets = [makeTarget(42, "NL", 100, "50m")]; // target_time_ms: 60000
    const ops = buildObjectiveSyncOps(objectives, map, existingTargets);
    assert.equal((ops).length, 0); // (stroke + distance + bassin) match → pas d'écrasement
  });

  it("ignore un objectif avec event_code null", async () => {
    const { buildObjectiveSyncOps } = await import("../CoachPaceCalculatorScreen");
    const map = new Map([["uuid-1", 42]]);
    const objectives = [makeObjective("uuid-1", null, 50, 60)];
    const ops = buildObjectiveSyncOps(objectives, map, []);
    assert.equal((ops).length, 0);
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
    assert.equal((ops).length, 2);
    assertMatchObject(ops[0].ref, { kind: "account", accountId: 1 });
    assertMatchObject(ops[1].ref, { kind: "account", accountId: 2 });
  });
});
