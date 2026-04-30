import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../client", () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
  canUseSupabase: () => true,
}));

import * as client from "../client";
import { getMyPaceZones, upsertMyPaceZones } from "../pace-zones";
import { DEFAULT_ZONES } from "@/lib/paceCalculator";

describe("pace-zones API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns DEFAULT_ZONES when no row exists", async () => {
    (client.supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
    });
    expect(await getMyPaceZones()).toEqual(DEFAULT_ZONES);
  });

  it("returns the persisted row when present", async () => {
    (client.supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: () => ({
        maybeSingle: () => Promise.resolve({
          data: { v0_pct: 145, v1_pct: 132, v2_pct: 116, v3_pct: 111, max_pct: 106 },
          error: null,
        }),
      }),
    });
    expect(await getMyPaceZones()).toEqual({
      v0_pct: 145, v1_pct: 132, v2_pct: 116, v3_pct: 111, max_pct: 106,
    });
  });

  it("upsert calls supabase.from('coach_pace_zones').upsert with coach_id", async () => {
    (client.supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: "coach-uuid" } },
    });
    const upsert = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: {}, error: null }) }),
    });
    (client.supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ upsert });
    await upsertMyPaceZones({ v0_pct: 140, v1_pct: 130, v2_pct: 115, v3_pct: 110, max_pct: 105 });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ coach_id: "coach-uuid", v0_pct: 140 }),
      expect.objectContaining({ onConflict: "coach_id" }),
    );
  });
});
