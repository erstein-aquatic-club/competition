import assert from "node:assert/strict";
import { describe, it, before, beforeEach } from "node:test";
import { mock } from "node:test";
import type { CoachManualSwimmer } from "../coach-manual-swimmers.ts";

let fromImpl: (...args: unknown[]) => unknown;
let getUserImpl: () => unknown;

const mockSwimmer = (overrides: Partial<CoachManualSwimmer> = {}): CoachManualSwimmer => ({
  id: "s1",
  coach_id: "coach-uuid",
  display_name: "Léo Martin",
  birthdate: null,
  sex: null,
  created_at: "2026-04-30T00:00:00Z",
  ...overrides,
});

before(async () => {
  const real = await import("../client.ts");
  mock.module("../client.ts", {
    namedExports: {
      ...real,
      canUseSupabase: () => true,
      supabase: {
        from: (...args: unknown[]) => fromImpl(...args),
        auth: { getUser: () => getUserImpl() },
      },
    },
  });
});

beforeEach(() => {
  fromImpl = () => { throw new Error("fromImpl not configured for this test"); };
  getUserImpl = () => { throw new Error("getUserImpl not configured for this test"); };
});

describe("coach-manual-swimmers API extensions", () => {
  describe("createManualSwimmer with optional fields", () => {
    it("passes birthdate and sex to insert when provided", async () => {
      getUserImpl = () => Promise.resolve({ data: { user: { id: "coach-uuid" } } });
      let capturedRow: Record<string, unknown> | undefined;
      fromImpl = () => ({
        insert: (row: unknown) => {
          capturedRow = row as Record<string, unknown>;
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: mockSwimmer({ birthdate: "2010-05-15", sex: "M" }),
                  error: null,
                }),
            }),
          };
        },
      });
      const { createManualSwimmer } = await import("../coach-manual-swimmers.ts");
      const result = await createManualSwimmer("Léo Martin", { birthdate: "2010-05-15", sex: "M" });
      assert.equal(capturedRow?.display_name, "Léo Martin");
      assert.equal(capturedRow?.birthdate, "2010-05-15");
      assert.equal(capturedRow?.sex, "M");
      assert.equal(result.birthdate, "2010-05-15");
    });
  });

  describe("updateManualSwimmer", () => {
    it("calls update with the patch and returns updated row", async () => {
      let capturedField: unknown;
      let capturedValue: unknown;
      fromImpl = () => ({
        update: () => ({
          eq: (field: unknown, value: unknown) => {
            capturedField = field;
            capturedValue = value;
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: mockSwimmer({ display_name: "Léo M." }),
                    error: null,
                  }),
              }),
            };
          },
        }),
      });
      const { updateManualSwimmer } = await import("../coach-manual-swimmers.ts");
      const result = await updateManualSwimmer("s1", { displayName: "Léo M." });
      assert.equal(capturedField, "id");
      assert.equal(capturedValue, "s1");
      assert.equal(result.display_name, "Léo M.");
    });

    it("throws on supabase error", async () => {
      fromImpl = () => ({
        update: () => ({
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: null, error: { message: "not found" } }),
            }),
          }),
        }),
      });
      const { updateManualSwimmer } = await import("../coach-manual-swimmers.ts");
      await assert.rejects(() => updateManualSwimmer("s1", { displayName: "X" }), /not found/);
    });
  });
});
