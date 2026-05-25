import assert from "node:assert/strict";
import { describe, it, before, beforeEach } from "node:test";
import { mock } from "node:test";
import type { StrengthAthleteSettings } from "../types.ts";

let fromImpl: (...args: unknown[]) => unknown;

const mockSettings = (
  overrides: Partial<StrengthAthleteSettings> = {},
): StrengthAthleteSettings => ({
  athlete_id: 42,
  practice_level: "intermediate",
  performance_tier: "club",
  updated_by: 7,
  updated_at: "2026-05-24T10:00:00Z",
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
      },
    },
  });
});

beforeEach(() => {
  fromImpl = () => {
    throw new Error("fromImpl not configured for this test");
  };
});

describe("strength-athlete-settings API", () => {
  describe("getStrengthAthleteSettings", () => {
    it("filters by athlete_id with maybeSingle and returns the row", async () => {
      let capturedTable: unknown;
      let capturedSelect: unknown;
      let capturedEq: [unknown, unknown] | undefined;
      const row = mockSettings({ practice_level: "advanced" });
      fromImpl = (table: unknown) => {
        capturedTable = table;
        return {
          select: (cols: unknown) => {
            capturedSelect = cols;
            return {
              eq: (field: unknown, value: unknown) => {
                capturedEq = [field, value];
                return {
                  maybeSingle: () => Promise.resolve({ data: row, error: null }),
                };
              },
            };
          },
        };
      };
      const { getStrengthAthleteSettings } = await import(
        "../strength-assessments.ts"
      );
      const result = await getStrengthAthleteSettings(42);
      assert.equal(capturedTable, "strength_athlete_settings");
      assert.equal(capturedSelect, "*");
      assert.deepEqual(capturedEq, ["athlete_id", 42]);
      assert.equal(result?.practice_level, "advanced");
    });

    it("returns null when no row matches", async () => {
      fromImpl = () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      });
      const { getStrengthAthleteSettings } = await import(
        "../strength-assessments.ts"
      );
      const result = await getStrengthAthleteSettings(99);
      assert.equal(result, null);
    });

    it("throws on supabase error", async () => {
      fromImpl = () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: null, error: { message: "get failed" } }),
          }),
        }),
      });
      const { getStrengthAthleteSettings } = await import(
        "../strength-assessments.ts"
      );
      await assert.rejects(() => getStrengthAthleteSettings(42), /get failed/);
    });
  });

  describe("upsertStrengthAthleteSettings", () => {
    it("upserts athlete_id + patch with onConflict athlete_id", async () => {
      let capturedTable: unknown;
      let capturedPayload: Record<string, unknown> | undefined;
      let capturedOpts: Record<string, unknown> | undefined;
      fromImpl = (table: unknown) => {
        capturedTable = table;
        return {
          upsert: (payload: unknown, opts: unknown) => {
            capturedPayload = payload as Record<string, unknown>;
            capturedOpts = opts as Record<string, unknown>;
            return Promise.resolve({ data: null, error: null });
          },
        };
      };
      const { upsertStrengthAthleteSettings } = await import(
        "../strength-assessments.ts"
      );
      await upsertStrengthAthleteSettings(42, {
        practice_level: "advanced",
        performance_tier: "national",
      });
      assert.equal(capturedTable, "strength_athlete_settings");
      assert.equal(capturedPayload?.athlete_id, 42);
      assert.equal(capturedPayload?.practice_level, "advanced");
      assert.equal(capturedPayload?.performance_tier, "national");
      assert.deepEqual(capturedOpts, { onConflict: "athlete_id" });
    });

    it("throws on supabase error", async () => {
      fromImpl = () => ({
        upsert: () =>
          Promise.resolve({ data: null, error: { message: "upsert failed" } }),
      });
      const { upsertStrengthAthleteSettings } = await import(
        "../strength-assessments.ts"
      );
      await assert.rejects(
        () =>
          upsertStrengthAthleteSettings(42, {
            practice_level: "beginner",
            performance_tier: "club",
          }),
        /upsert failed/,
      );
    });
  });
});
