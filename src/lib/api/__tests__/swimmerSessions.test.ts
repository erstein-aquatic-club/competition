import assert from "node:assert/strict";
import { describe, it, before, beforeEach, mock } from "node:test";

type RpcCall = { fn: string; params: unknown };

const rpcCalls: RpcCall[] = [];
let rpcResult: { data: unknown; error: null | { message: string } } = {
  data: [],
  error: null,
};

before(async () => {
  const real = await import("../client.ts");
  mock.module("../client.ts", {
    namedExports: {
      ...real,
      canUseSupabase: () => true,
      supabase: {
        rpc: (fn: string, params: unknown) => {
          rpcCalls.push({ fn, params });
          return Promise.resolve(rpcResult);
        },
      },
    },
  });
});

describe("getSwimmerSessions", () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    rpcResult = { data: [], error: null };
  });

  it("passes parameters to RPC and returns data", async () => {
    rpcResult = {
      data: [{ scheduled_date: "2026-04-09", assignment_source: "group" }],
      error: null,
    };
    const { getSwimmerSessions } = await import("../swimmerSessions.ts");
    const result = await getSwimmerSessions(1, "2026-04-09", "2026-04-10");
    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0].fn, "get_swimmer_sessions");
    assert.deepEqual(rpcCalls[0].params, {
      p_user_id: 1,
      p_from: "2026-04-09",
      p_to: "2026-04-10",
      p_include_drafts: false,
    });
    assert.equal(result.length, 1);
  });

  it("throws on RPC error", async () => {
    rpcResult = { data: null, error: { message: "boom" } };
    const { getSwimmerSessions } = await import("../swimmerSessions.ts");
    await assert.rejects(
      () => getSwimmerSessions(1, "2026-04-09", "2026-04-10"),
      /boom/,
    );
  });

  it("forwards includeDrafts flag", async () => {
    rpcResult = { data: [], error: null };
    const { getSwimmerSessions } = await import("../swimmerSessions.ts");
    await getSwimmerSessions(1, "2026-04-09", "2026-04-10", true);
    assert.equal(rpcCalls.length, 1);
    assert.equal(
      (rpcCalls[0].params as { p_include_drafts: boolean }).p_include_drafts,
      true,
    );
  });
});
