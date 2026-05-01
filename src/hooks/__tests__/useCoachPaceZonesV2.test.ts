import assert from "node:assert/strict";
import { describe, it, before, beforeEach } from "node:test";
import { mock } from "node:test";

// Closure-delegation vars — reassigned per test
let initImpl: () => Promise<boolean>;
let getZonesImpl: () => Promise<unknown>;
let upsertCellImpl: (args: unknown) => Promise<void>;
let deleteCellImpl: (args: unknown) => Promise<void>;
let resetImpl: () => Promise<void>;

before(async () => {
  mock.module("@/lib/api/pace-zones", {
    namedExports: {
      initMyPaceZonesIfMissing: () => initImpl(),
      getMyPaceZonesV2: () => getZonesImpl(),
      upsertPaceZoneCell: (args: unknown) => upsertCellImpl(args),
      deletePaceZoneCell: (args: unknown) => deleteCellImpl(args),
      resetMyPaceZonesToDefaults: () => resetImpl(),
    },
  });
});

beforeEach(() => {
  initImpl = async () => { throw new Error("initImpl not configured"); };
  getZonesImpl = async () => { throw new Error("getZonesImpl not configured"); };
  upsertCellImpl = async () => { throw new Error("upsertCellImpl not configured"); };
  deleteCellImpl = async () => { throw new Error("deleteCellImpl not configured"); };
  resetImpl = async () => { throw new Error("resetImpl not configured"); };
});

describe("paceZonesQueryFn", () => {
  it("DB vide — init appelé, puis zones retournées", async () => {
    let initCalled = false;
    initImpl = async () => { initCalled = true; return true; };
    const expected = { "50m": { V0: 0.70, MAX: 1.00 } };
    getZonesImpl = async () => expected;
    const { paceZonesQueryFn } = await import("../useCoachPaceZonesV2.ts");
    const result = await paceZonesQueryFn();
    assert.ok(initCalled, "initMyPaceZonesIfMissing doit être appelé");
    assert.deepEqual(result, expected);
  });

  it("DB non-vide — init idempotent (retourne false), zones reflètent la DB", async () => {
    let initCalled = false;
    initImpl = async () => { initCalled = true; return false; };
    const dbZones = { "100m": { V1: 0.82, V2: 0.90 } };
    getZonesImpl = async () => dbZones;
    const { paceZonesQueryFn } = await import("../useCoachPaceZonesV2.ts");
    const result = await paceZonesQueryFn();
    assert.ok(initCalled, "initMyPaceZonesIfMissing appelé même si rows existent");
    assert.deepEqual(result, dbZones);
  });
});

describe("computeToggleV4Action", () => {
  it("200m sans V4 → upsert avec k=0.985", async () => {
    const { computeToggleV4Action } = await import("../useCoachPaceZonesV2.ts");
    const result = computeToggleV4Action("200m", {});
    assert.ok(result !== null, "ne doit pas retourner null pour 200m");
    assert.equal(result!.action, "upsert");
    assert.ok(
      Math.abs((result as { action: "upsert"; k_value: number }).k_value - 0.985) < 0.0001,
      `k_value attendu 0.985, reçu ${(result as { action: "upsert"; k_value: number }).k_value}`,
    );
  });

  it("200m avec V4 déjà présent → delete", async () => {
    const { computeToggleV4Action } = await import("../useCoachPaceZonesV2.ts");
    const result = computeToggleV4Action("200m", { "200m": { "V4": 0.985 } });
    assert.equal(result?.action, "delete");
  });

  it("400m sans V4 → upsert avec k=0.985 (fallback)", async () => {
    const { computeToggleV4Action } = await import("../useCoachPaceZonesV2.ts");
    const result = computeToggleV4Action("400m", {});
    assert.ok(result !== null, "400m doit retourner upsert, pas null");
    assert.equal(result!.action, "upsert");
    assert.ok(
      Math.abs((result as { action: "upsert"; k_value: number }).k_value - 0.985) < 0.0001,
      `k_value attendu 0.985, reçu ${(result as { action: "upsert"; k_value: number }).k_value}`,
    );
  });

  it("400m avec V4 déjà en DB → delete (re-toggle)", async () => {
    const { computeToggleV4Action } = await import("../useCoachPaceZonesV2.ts");
    const result = computeToggleV4Action("400m", { "400m": { "V4": 0.985 } });
    assert.equal(result?.action, "delete");
  });

  it("800m_1500m sans V4 → upsert avec k=0.985 (fallback)", async () => {
    const { computeToggleV4Action } = await import("../useCoachPaceZonesV2.ts");
    const result = computeToggleV4Action("800m_1500m", {});
    assert.ok(result !== null, "800m_1500m doit retourner upsert, pas null");
    assert.equal(result!.action, "upsert");
    assert.ok(
      Math.abs((result as { action: "upsert"; k_value: number }).k_value - 0.985) < 0.0001,
    );
  });

  it("50m sans V4 → upsert avec k=0.98", async () => {
    const { computeToggleV4Action } = await import("../useCoachPaceZonesV2.ts");
    const result = computeToggleV4Action("50m", { "50m": { "V0": 0.70 } });
    assert.ok(result !== null);
    assert.equal(result!.action, "upsert");
    assert.ok(
      Math.abs((result as { action: "upsert"; k_value: number }).k_value - 0.98) < 0.0001,
      `k_value attendu 0.98 pour 50m`,
    );
  });

  it("50m avec V4 déjà présent → delete", async () => {
    const { computeToggleV4Action } = await import("../useCoachPaceZonesV2.ts");
    const result = computeToggleV4Action("50m", { "50m": { "V4": 0.98 } });
    assert.equal(result?.action, "delete");
  });

  it("undefined zones (premier chargement) → upsert pour 100m", async () => {
    const { computeToggleV4Action } = await import("../useCoachPaceZonesV2.ts");
    const result = computeToggleV4Action("100m", undefined);
    assert.ok(result !== null);
    assert.equal(result!.action, "upsert");
  });
});
