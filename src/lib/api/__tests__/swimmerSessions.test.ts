import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../client", () => ({
  canUseSupabase: () => true,
  supabase: {
    rpc: vi.fn(),
  },
}));

import { getSwimmerSessions } from "../swimmerSessions";
import { supabase } from "../client";

describe("getSwimmerSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes parameters to RPC and returns data", async () => {
    (supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ scheduled_date: "2026-04-09", assignment_source: "group" }],
      error: null,
    });
    const result = await getSwimmerSessions(1, "2026-04-09", "2026-04-10");
    expect(supabase.rpc).toHaveBeenCalledWith("get_swimmer_sessions", {
      p_user_id: 1,
      p_from: "2026-04-09",
      p_to: "2026-04-10",
      p_include_drafts: false,
    });
    expect(result).toHaveLength(1);
  });

  it("throws on RPC error", async () => {
    (supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    await expect(
      getSwimmerSessions(1, "2026-04-09", "2026-04-10"),
    ).rejects.toThrow("boom");
  });

  it("forwards includeDrafts flag", async () => {
    (supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      error: null,
    });
    await getSwimmerSessions(1, "2026-04-09", "2026-04-10", true);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "get_swimmer_sessions",
      expect.objectContaining({ p_include_drafts: true }),
    );
  });
});
