import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../client", () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
    rpc: vi.fn(),
  },
  canUseSupabase: () => true,
}));

import * as client from "../client";
import { createPaceShareLink, getPaceSharePayload } from "../pace-share";

describe("pace-share API", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("createPaceShareLink", () => {
    it("inserts a row and returns token + url for account swimmer", async () => {
      (client.supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { user: { id: "coach-uuid" } },
      });
      const single = vi.fn().mockResolvedValue({
        data: { token: "abc-token-uuid" },
        error: null,
      });
      (client.supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        insert: () => ({ select: () => ({ single }) }),
      });

      const result = await createPaceShareLink({ kind: "account", accountId: 42 });

      expect(result.token).toBe("abc-token-uuid");
      expect(result.url).toContain("abc-token-uuid");
      expect(single).toHaveBeenCalled();
    });

    it("inserts with swimmer_manual_id for manual swimmer", async () => {
      (client.supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { user: { id: "coach-uuid" } },
      });
      const insert = vi.fn().mockReturnValue({
        select: () => ({ single: () => Promise.resolve({ data: { token: "manual-token" }, error: null }) }),
      });
      (client.supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ insert });

      await createPaceShareLink({ kind: "manual", manualId: "manual-uuid" });

      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ swimmer_manual_id: "manual-uuid", swimmer_account_id: null }),
      );
    });
  });

  describe("getPaceSharePayload", () => {
    it("calls get_pace_share_payload RPC and returns parsed payload", async () => {
      const payload = {
        swimmer_name: "Léo",
        zones: { v0_pct: 140, v1_pct: 130, v2_pct: 115, v3_pct: 110, max_pct: 105 },
        targets: [],
      };
      (client.supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: payload,
        error: null,
      });

      const result = await getPaceSharePayload("some-token");
      expect(result).toEqual(payload);
      expect(client.supabase.rpc).toHaveBeenCalledWith("get_pace_share_payload", { token_in: "some-token" });
    });

    it("returns null when RPC returns null (expired token)", async () => {
      (client.supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
      expect(await getPaceSharePayload("expired")).toBeNull();
    });
  });
});
