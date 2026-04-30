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
  createManualSwimmer,
  updateManualSwimmer,
  type CoachManualSwimmer,
} from "../coach-manual-swimmers";

const mockSwimmer = (overrides: Partial<CoachManualSwimmer> = {}): CoachManualSwimmer => ({
  id: "s1",
  coach_id: "coach-uuid",
  display_name: "Léo Martin",
  birthdate: null,
  sex: null,
  created_at: "2026-04-30T00:00:00Z",
  ...overrides,
});

describe("coach-manual-swimmers API extensions", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("createManualSwimmer with optional fields", () => {
    it("passes birthdate and sex to insert when provided", async () => {
      (client.supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { user: { id: "coach-uuid" } },
      });
      const insert = vi.fn().mockReturnValue({
        select: () => ({ single: () => Promise.resolve({ data: mockSwimmer({ birthdate: "2010-05-15", sex: "M" }), error: null }) }),
      });
      (client.supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ insert });

      const result = await createManualSwimmer("Léo Martin", { birthdate: "2010-05-15", sex: "M" });

      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ display_name: "Léo Martin", birthdate: "2010-05-15", sex: "M" }),
      );
      expect(result.birthdate).toBe("2010-05-15");
    });
  });

  describe("updateManualSwimmer", () => {
    it("calls update with the patch and returns updated row", async () => {
      const eqMock = vi.fn().mockReturnValue({
        select: () => ({ single: () => Promise.resolve({ data: mockSwimmer({ display_name: "Léo M." }), error: null }) }),
      });
      (client.supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        update: () => ({ eq: eqMock }),
      });

      const result = await updateManualSwimmer("s1", { displayName: "Léo M." });

      expect(eqMock).toHaveBeenCalledWith("id", "s1");
      expect(result.display_name).toBe("Léo M.");
    });

    it("throws on supabase error", async () => {
      const eqMock = vi.fn().mockReturnValue({
        select: () => ({ single: () => Promise.resolve({ data: null, error: { message: "not found" } }) }),
      });
      (client.supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        update: () => ({ eq: eqMock }),
      });
      await expect(updateManualSwimmer("s1", { displayName: "X" })).rejects.toThrow("not found");
    });
  });
});
