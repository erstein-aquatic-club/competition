import { describe, it, expect } from "vitest";
import type { PaceTarget } from "@/lib/api/pace-targets";
import type { TeamMember } from "@/hooks/useMyTeam";

// Full render requires QueryClient + Supabase — covered by manual E2E.

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
      stroke: "NL", target_distance_m: 100, target_time_ms: 60000, updated_at: "2026-01-01",
    };
    expect(belongsTo(target, swimmer)).toBe(true);
  });

  it("does not match account swimmer with different id", async () => {
    const { belongsTo } = await import("../CoachPaceCalculatorScreen");
    const swimmer: TeamMember = { kind: "account", id: "account-99", accountId: 99, displayName: "Léo" };
    const target: PaceTarget = {
      id: "t2", coach_id: "c", swimmer_account_id: 42, swimmer_manual_id: null,
      stroke: "NL", target_distance_m: 100, target_time_ms: 60000, updated_at: "2026-01-01",
    };
    expect(belongsTo(target, swimmer)).toBe(false);
  });

  it("matches manual swimmer by manualId", async () => {
    const { belongsTo } = await import("../CoachPaceCalculatorScreen");
    const swimmer: TeamMember = { kind: "manual", id: "manual-abc", manualId: "abc-uuid", displayName: "Inv." };
    const target: PaceTarget = {
      id: "t3", coach_id: "c", swimmer_account_id: null, swimmer_manual_id: "abc-uuid",
      stroke: "Dos", target_distance_m: 50, target_time_ms: 30000, updated_at: "2026-01-01",
    };
    expect(belongsTo(target, swimmer)).toBe(true);
  });

  it("filters correctly with Array.filter", async () => {
    const { belongsTo } = await import("../CoachPaceCalculatorScreen");
    const swimmer: TeamMember = { kind: "account", id: "account-1", accountId: 1, displayName: "A" };
    const targets: PaceTarget[] = [
      { id: "t1", coach_id: "c", swimmer_account_id: 1, swimmer_manual_id: null, stroke: "NL", target_distance_m: 100, target_time_ms: 60000, updated_at: "" },
      { id: "t2", coach_id: "c", swimmer_account_id: 2, swimmer_manual_id: null, stroke: "NL", target_distance_m: 100, target_time_ms: 60000, updated_at: "" },
      { id: "t3", coach_id: "c", swimmer_account_id: 1, swimmer_manual_id: null, stroke: "Dos", target_distance_m: 50, target_time_ms: 30000, updated_at: "" },
    ];
    const filtered = targets.filter((t) => belongsTo(t, swimmer));
    expect(filtered).toHaveLength(2);
    expect(filtered.map((t) => t.id)).toEqual(["t1", "t3"]);
  });
});
