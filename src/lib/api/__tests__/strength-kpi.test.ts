import assert from "node:assert/strict";
import { describe, it, before, beforeEach } from "node:test";
import { mock } from "node:test";
import type { StrengthKpiKey, StrengthKpiMeasurement } from "../types.ts";

let fromImpl: (...args: unknown[]) => unknown;

const mockMeasurement = (
  overrides: Partial<StrengthKpiMeasurement> = {},
): StrengthKpiMeasurement => ({
  id: "m1",
  athlete_id: 42,
  kpi_key: "vertical_jump",
  value: 38.5,
  unit: "cm",
  attempts: [37, 38.5, 38],
  measured_at: "2026-05-01T10:00:00Z",
  measured_by: 7,
  assisted_by: null,
  source: "wizard_athlete",
  coach_reviewed: false,
  notes: null,
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
  fromImpl = () => { throw new Error("fromImpl not configured for this test"); };
});

describe("strength-kpi API", () => {
  describe("recordKpiMeasurement", () => {
    it("inserts into strength_kpi_measurements with the right fields and returns the row", async () => {
      let capturedTable: unknown;
      let capturedInsert: Record<string, unknown> | undefined;
      const row = mockMeasurement({ id: "m99" });
      fromImpl = (table: unknown) => {
        capturedTable = table;
        return {
          insert: (payload: unknown) => {
            capturedInsert = payload as Record<string, unknown>;
            return {
              select: () => ({
                single: () => Promise.resolve({ data: row, error: null }),
              }),
            };
          },
        };
      };
      const { recordKpiMeasurement } = await import("../strength-kpi.ts");
      const result = await recordKpiMeasurement({
        athlete_id: 42,
        kpi_key: "vertical_jump",
        value: 38.5,
        unit: "cm",
        attempts: [37, 38.5, 38],
        measured_by: 7,
        source: "wizard_athlete",
      });
      assert.equal(capturedTable, "strength_kpi_measurements");
      assert.equal(capturedInsert?.athlete_id, 42);
      assert.equal(capturedInsert?.kpi_key, "vertical_jump");
      assert.equal(capturedInsert?.value, 38.5);
      assert.equal(capturedInsert?.unit, "cm");
      assert.deepEqual(capturedInsert?.attempts, [37, 38.5, 38]);
      assert.equal(capturedInsert?.measured_by, 7);
      assert.equal(capturedInsert?.source, "wizard_athlete");
      assert.equal(result.id, "m99");
    });

    it("defaults optional fields to null when omitted", async () => {
      let capturedInsert: Record<string, unknown> | undefined;
      fromImpl = () => ({
        insert: (payload: unknown) => {
          capturedInsert = payload as Record<string, unknown>;
          return {
            select: () => ({
              single: () => Promise.resolve({ data: mockMeasurement(), error: null }),
            }),
          };
        },
      });
      const { recordKpiMeasurement } = await import("../strength-kpi.ts");
      await recordKpiMeasurement({
        athlete_id: 42,
        kpi_key: "imtp",
        value: 1200,
        unit: "N",
        measured_by: 7,
        source: "wizard_coach",
      });
      assert.equal(capturedInsert?.attempts, null);
      assert.equal(capturedInsert?.assisted_by, null);
      assert.equal(capturedInsert?.notes, null);
    });

    it("throws on supabase error", async () => {
      fromImpl = () => ({
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: null, error: { message: "insert failed" } }),
          }),
        }),
      });
      const { recordKpiMeasurement } = await import("../strength-kpi.ts");
      await assert.rejects(
        () => recordKpiMeasurement({
          athlete_id: 42,
          kpi_key: "imtp",
          value: 1200,
          unit: "N",
          measured_by: 7,
          source: "wizard_coach",
        }),
        /insert failed/,
      );
    });

    // §314 (#3 Slice B) — idempotence offline : avec une clé de dédup, l'écriture
    // doit être un UPSERT ON CONFLICT (client_dedup_key) pour que le replay de la
    // file (ACK perdu) ne duplique pas la mesure.
    it("upserts on client_dedup_key (idempotent) when a dedup key is provided", async () => {
      let usedUpsert = false;
      let usedInsert = false;
      let capturedOnConflict: unknown;
      let capturedPayload: Record<string, unknown> | undefined;
      fromImpl = () => ({
        insert: () => {
          usedInsert = true;
          return { select: () => ({ single: () => Promise.resolve({ data: mockMeasurement(), error: null }) }) };
        },
        upsert: (payload: unknown, opts: unknown) => {
          usedUpsert = true;
          capturedPayload = payload as Record<string, unknown>;
          capturedOnConflict = (opts as { onConflict?: unknown })?.onConflict;
          return { select: () => ({ single: () => Promise.resolve({ data: mockMeasurement({ id: "m-dedup" }), error: null }) }) };
        },
      });
      const { recordKpiMeasurement } = await import("../strength-kpi.ts");
      const result = await recordKpiMeasurement({
        athlete_id: 42,
        kpi_key: "imtp",
        value: 1200,
        unit: "N",
        measured_by: 7,
        source: "wizard_coach",
        client_dedup_key: "dedup-123",
      });
      assert.equal(usedUpsert, true, "doit utiliser upsert quand une clé de dédup est fournie");
      assert.equal(usedInsert, false, "ne doit PAS faire un insert simple quand une clé de dédup est fournie");
      assert.equal(capturedOnConflict, "client_dedup_key");
      assert.equal(capturedPayload?.client_dedup_key, "dedup-123");
      assert.equal(result.id, "m-dedup");
    });
  });

  describe("getKpiHistory", () => {
    it("filters by athlete_id and kpi_key, orders by measured_at desc", async () => {
      let capturedTable: unknown;
      const eqCalls: [unknown, unknown][] = [];
      let capturedOrder: [unknown, unknown] | undefined;
      const rows = [
        mockMeasurement({ id: "m2", measured_at: "2026-05-10T10:00:00Z" }),
        mockMeasurement({ id: "m1", measured_at: "2026-05-01T10:00:00Z" }),
      ];
      fromImpl = (table: unknown) => {
        capturedTable = table;
        return {
          select: () => ({
            eq: function eqA(field: unknown, value: unknown) {
              eqCalls.push([field, value]);
              return {
                eq: function eqB(f2: unknown, v2: unknown) {
                  eqCalls.push([f2, v2]);
                  return {
                    order: (col: unknown, opts: unknown) => {
                      capturedOrder = [col, opts];
                      return Promise.resolve({ data: rows, error: null });
                    },
                  };
                },
              };
            },
          }),
        };
      };
      const { getKpiHistory } = await import("../strength-kpi.ts");
      const result = await getKpiHistory(42, "vertical_jump");
      assert.equal(capturedTable, "strength_kpi_measurements");
      assert.deepEqual(eqCalls[0], ["athlete_id", 42]);
      assert.deepEqual(eqCalls[1], ["kpi_key", "vertical_jump"]);
      assert.equal(capturedOrder?.[0], "measured_at");
      assert.deepEqual(capturedOrder?.[1], { ascending: false });
      assert.equal(result.length, 2);
      assert.equal(result[0].id, "m2");
    });

    it("returns [] when data is null", async () => {
      fromImpl = () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
      });
      const { getKpiHistory } = await import("../strength-kpi.ts");
      const result = await getKpiHistory(42, "imtp");
      assert.deepEqual(result, []);
    });

    it("throws on supabase error", async () => {
      fromImpl = () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: null, error: { message: "select failed" } }),
            }),
          }),
        }),
      });
      const { getKpiHistory } = await import("../strength-kpi.ts");
      await assert.rejects(() => getKpiHistory(42, "imtp"), /select failed/);
    });
  });

  describe("getLatestKpiMeasurements", () => {
    it("keeps the first (most recent) row per kpi_key and null for missing keys", async () => {
      // Rows sorted measured_at desc — first row of each key is the latest.
      const rows = [
        mockMeasurement({ id: "vj-new", kpi_key: "vertical_jump", measured_at: "2026-05-10T00:00:00Z" }),
        mockMeasurement({ id: "vj-old", kpi_key: "vertical_jump", measured_at: "2026-04-01T00:00:00Z" }),
        mockMeasurement({ id: "bj-new", kpi_key: "broad_jump", measured_at: "2026-05-08T00:00:00Z" }),
        mockMeasurement({ id: "bj-old", kpi_key: "broad_jump", measured_at: "2026-03-01T00:00:00Z" }),
        mockMeasurement({ id: "imtp-1", kpi_key: "imtp", measured_at: "2026-05-05T00:00:00Z" }),
      ];
      let capturedOrder: [unknown, unknown] | undefined;
      const eqCalls: [unknown, unknown][] = [];
      fromImpl = () => ({
        select: () => ({
          eq: (field: unknown, value: unknown) => {
            eqCalls.push([field, value]);
            return {
              order: (col: unknown, opts: unknown) => {
                capturedOrder = [col, opts];
                return Promise.resolve({ data: rows, error: null });
              },
            };
          },
        }),
      });
      const { getLatestKpiMeasurements } = await import("../strength-kpi.ts");
      const result = await getLatestKpiMeasurements(42);
      assert.deepEqual(eqCalls[0], ["athlete_id", 42]);
      assert.equal(capturedOrder?.[0], "measured_at");
      assert.deepEqual(capturedOrder?.[1], { ascending: false });
      // Latest per key kept
      assert.equal(result.vertical_jump?.id, "vj-new");
      assert.equal(result.broad_jump?.id, "bj-new");
      assert.equal(result.imtp?.id, "imtp-1");
      // Keys with no rows → null
      assert.equal(result.weighted_pullup, null);
      assert.equal(result.medball_vertical_throw, null);
    });

    it("returns an all-null record for the 5 keys when there are no rows", async () => {
      fromImpl = () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      });
      const { getLatestKpiMeasurements } = await import("../strength-kpi.ts");
      const result = await getLatestKpiMeasurements(42);
      const keys: StrengthKpiKey[] = [
        "vertical_jump", "broad_jump", "imtp", "weighted_pullup", "medball_vertical_throw",
      ];
      assert.deepEqual(Object.keys(result).sort(), [...keys].sort());
      for (const k of keys) {
        assert.equal(result[k], null);
      }
    });

    it("throws on supabase error", async () => {
      fromImpl = () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: null, error: { message: "latest failed" } }),
          }),
        }),
      });
      const { getLatestKpiMeasurements } = await import("../strength-kpi.ts");
      await assert.rejects(() => getLatestKpiMeasurements(42), /latest failed/);
    });
  });

  describe("markKpiReviewed", () => {
    it("updates coach_reviewed=true filtered by id with select('id')", async () => {
      let capturedTable: unknown;
      let capturedUpdate: Record<string, unknown> | undefined;
      let capturedEq: [unknown, unknown] | undefined;
      let capturedSelect: unknown;
      fromImpl = (table: unknown) => {
        capturedTable = table;
        return {
          update: (payload: unknown) => {
            capturedUpdate = payload as Record<string, unknown>;
            return {
              eq: (field: unknown, value: unknown) => {
                capturedEq = [field, value];
                return {
                  select: (cols: unknown) => {
                    capturedSelect = cols;
                    return Promise.resolve({ data: [{ id: "m1" }], error: null });
                  },
                };
              },
            };
          },
        };
      };
      const { markKpiReviewed } = await import("../strength-kpi.ts");
      await markKpiReviewed("m1");
      assert.equal(capturedTable, "strength_kpi_measurements");
      assert.equal(capturedUpdate?.coach_reviewed, true);
      assert.deepEqual(capturedEq, ["id", "m1"]);
      assert.equal(capturedSelect, "id");
    });

    it("throws when the update affects no rows (§113 silent no-op guard)", async () => {
      fromImpl = () => ({
        update: () => ({
          eq: () => ({
            select: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      });
      const { markKpiReviewed } = await import("../strength-kpi.ts");
      await assert.rejects(() => markKpiReviewed("missing"), /not found or not allowed/);
    });

    it("throws on supabase error", async () => {
      fromImpl = () => ({
        update: () => ({
          eq: () => ({
            select: () => Promise.resolve({ data: null, error: { message: "update failed" } }),
          }),
        }),
      });
      const { markKpiReviewed } = await import("../strength-kpi.ts");
      await assert.rejects(() => markKpiReviewed("m1"), /update failed/);
    });
  });
});
