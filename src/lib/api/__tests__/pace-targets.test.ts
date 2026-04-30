import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../client", () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
  canUseSupabase: () => true,
}));

import * as client from "../client";
import {
  listMyPaceTargets,
  upsertPaceTarget,
  deletePaceTarget,
  type PaceTarget,
  type SwimmerRef,
} from "../pace-targets";

const mockTarget = (overrides: Partial<PaceTarget> = {}): PaceTarget => ({
  id: "t1",
  coach_id: "coach-uuid",
  swimmer_account_id: 42,
  swimmer_manual_id: null,
  stroke: "NL",
  target_distance_m: 100,
  target_time_ms: 65_000,
  updated_at: "2026-04-30T00:00:00Z",
  ...overrides,
});

describe("pace-targets API", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("listMyPaceTargets", () => {
    it("returns targets sorted by updated_at desc", async () => {
      const rows = [
        mockTarget({ id: "t1", updated_at: "2026-04-30T10:00:00Z" }),
        mockTarget({ id: "t2", updated_at: "2026-04-28T10:00:00Z" }),
      ];
      (client.supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: () => ({
          order: () => Promise.resolve({ data: rows, error: null }),
        }),
      });
      const result = await listMyPaceTargets();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("t1");
    });

    it("throws on supabase error", async () => {
      (client.supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: () => ({
          order: () => Promise.resolve({ data: null, error: { message: "DB error" } }),
        }),
      });
      await expect(listMyPaceTargets()).rejects.toThrow("DB error");
    });
  });

  describe("upsertPaceTarget — account swimmer", () => {
    it("calls upsert with correct onConflict for account swimmer", async () => {
      (client.supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { user: { id: "coach-uuid" } },
      });
      const upsert = vi.fn().mockReturnValue({
        select: () => ({ single: () => Promise.resolve({ data: mockTarget(), error: null }) }),
      });
      (client.supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ upsert });

      const swimmer: SwimmerRef = { kind: "account", accountId: 42 };
      await upsertPaceTarget({ swimmer, stroke: "NL", target_distance_m: 100, target_time_ms: 65_000 });

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ coach_id: "coach-uuid", swimmer_account_id: 42, swimmer_manual_id: null }),
        expect.objectContaining({ onConflict: "uq_pace_targets_account" }),
      );
    });
  });

  describe("upsertPaceTarget — manual swimmer", () => {
    it("calls upsert with correct onConflict for manual swimmer", async () => {
      (client.supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { user: { id: "coach-uuid" } },
      });
      const upsert = vi.fn().mockReturnValue({
        select: () => ({ single: () => Promise.resolve({ data: mockTarget({ swimmer_account_id: null, swimmer_manual_id: "manual-uuid" }), error: null }) }),
      });
      (client.supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ upsert });

      const swimmer: SwimmerRef = { kind: "manual", manualId: "manual-uuid" };
      await upsertPaceTarget({ swimmer, stroke: "NL", target_distance_m: 100, target_time_ms: 65_000 });

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ swimmer_manual_id: "manual-uuid", swimmer_account_id: null }),
        expect.objectContaining({ onConflict: "uq_pace_targets_manual" }),
      );
    });
  });

  describe("deletePaceTarget", () => {
    it("calls delete with correct id filter", async () => {
      const eqMock = vi.fn().mockResolvedValue({ error: null });
      (client.supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        delete: () => ({ eq: eqMock }),
      });
      await deletePaceTarget("t1");
      expect(eqMock).toHaveBeenCalledWith("id", "t1");
    });
  });
});
