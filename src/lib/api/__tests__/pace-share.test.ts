import assert from "node:assert/strict";
import { describe, it, before, beforeEach } from "node:test";
import { mock } from "node:test";

let fromImpl: (...args: unknown[]) => unknown;
let getUserImpl: () => unknown;
let rpcImpl: (...args: unknown[]) => unknown;

before(async () => {
  const real = await import("../client.ts");
  mock.module("../client.ts", {
    namedExports: {
      ...real,
      canUseSupabase: () => true,
      supabase: {
        from: (...args: unknown[]) => fromImpl(...args),
        auth: { getUser: () => getUserImpl() },
        rpc: (...args: unknown[]) => rpcImpl(...args),
      },
    },
  });
});

beforeEach(() => {
  fromImpl = () => { throw new Error("fromImpl not configured for this test"); };
  getUserImpl = () => { throw new Error("getUserImpl not configured for this test"); };
  rpcImpl = () => { throw new Error("rpcImpl not configured for this test"); };
});

describe("pace-share API", () => {
  describe("createPaceShareLink", () => {
    it("inserts a row and returns token + url for account swimmer", async () => {
      getUserImpl = () => Promise.resolve({ data: { user: { id: "coach-uuid" } } });
      fromImpl = () => ({
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: { token: "abc-token-uuid" }, error: null }),
          }),
        }),
      });
      const { createPaceShareLink } = await import("../pace-share.ts");
      const result = await createPaceShareLink({ kind: "account", accountId: 42 });
      assert.equal(result.token, "abc-token-uuid");
      assert.ok(result.url.includes("abc-token-uuid"), `url should contain token, got: ${result.url}`);
    });

    it("inserts with swimmer_manual_id for manual swimmer", async () => {
      getUserImpl = () => Promise.resolve({ data: { user: { id: "coach-uuid" } } });
      let capturedRow: Record<string, unknown> | undefined;
      fromImpl = () => ({
        insert: (row: unknown) => {
          capturedRow = row as Record<string, unknown>;
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { token: "manual-token" }, error: null }),
            }),
          };
        },
      });
      const { createPaceShareLink } = await import("../pace-share.ts");
      await createPaceShareLink({ kind: "manual", manualId: "manual-uuid" });
      assert.equal(capturedRow?.swimmer_manual_id, "manual-uuid");
      assert.equal(capturedRow?.swimmer_account_id, null);
    });
  });

  describe("getPaceSharePayload", () => {
    it("calls get_pace_share_payload RPC and returns parsed payload", async () => {
      const payload = {
        swimmer_name: "Léo",
        zones: { v0_pct: 140, v1_pct: 130, v2_pct: 115, v3_pct: 110, max_pct: 105 },
        targets: [],
      };
      let capturedFn: unknown;
      let capturedArgs: unknown;
      rpcImpl = (fn: unknown, args: unknown) => {
        capturedFn = fn;
        capturedArgs = args;
        return Promise.resolve({ data: payload, error: null });
      };
      const { getPaceSharePayload } = await import("../pace-share.ts");
      const result = await getPaceSharePayload("some-token");
      assert.deepEqual(result, payload);
      assert.equal(capturedFn, "get_pace_share_payload");
      assert.deepEqual(capturedArgs, { token_in: "some-token" });
    });

    it("returns null when RPC returns null (expired token)", async () => {
      rpcImpl = () => Promise.resolve({ data: null, error: null });
      const { getPaceSharePayload } = await import("../pace-share.ts");
      assert.equal(await getPaceSharePayload("expired"), null);
    });
  });
});
