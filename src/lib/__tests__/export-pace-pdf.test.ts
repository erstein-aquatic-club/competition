/**
 * export-pace-pdf.test.ts — Smoke tests pour exportPacePdf (§186).
 *
 * Tests: node:test + mock.module.
 * jsPDF n'est pas disponible dans node sans DOM, on le mocke intégralement.
 * Les assertions vérifient uniquement : Blob non vide + pas d'exception.
 */
import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { mock } from "node:test";
import type { EventFamily, Zone } from "../paceData.ts";
import type { PaceTarget } from "../api/pace-targets.ts";

// ─── Types helpers ────────────────────────────────────────────────────────────

type SingleStroke = "crawl" | "dos" | "brasse" | "papillon";

const DEFAULT_ZONES: Record<EventFamily, Partial<Record<Zone, number>>> = {
  "50m":        { V0: 0.70, V1: 0.78, V2: 0.86, V3: 0.94, V4: 0.98,  MAX: 1.00 },
  "100m":       { V0: 0.72, V1: 0.80, V2: 0.88, V3: 0.95, V4: 0.98,  MAX: 1.00 },
  "200m":       { V0: 0.74, V1: 0.82, V2: 0.90, V3: 0.96, V4: 0.985, MAX: 1.00 },
  "400m":       { V0: 0.76, V1: 0.84, V2: 0.91, V3: 0.96,            MAX: 1.00 },
  "800m_1500m": { V0: 0.78, V1: 0.86, V2: 0.92, V3: 0.97,            MAX: 1.00 },
};

const DEFAULT_ADJUSTMENTS: Record<SingleStroke, Record<EventFamily, number>> = {
  crawl:    { "50m": 0, "100m": 0, "200m": 0, "400m": 0, "800m_1500m": 0 },
  papillon: { "50m": 0, "100m": 0, "200m": 0.01, "400m": 0.01, "800m_1500m": 0.01 },
  dos:      { "50m": 0.06, "100m": 0.045, "200m": 0.02, "400m": 0.01, "800m_1500m": 0.01 },
  brasse:   { "50m": 0.04, "100m": 0.035, "200m": 0.025, "400m": 0.01, "800m_1500m": 0.01 },
};

function makeTarget(overrides: Partial<PaceTarget> = {}): PaceTarget {
  return {
    id: "t1",
    coach_id: "coach-1",
    swimmer_account_id: 42,
    swimmer_manual_id: null,
    stroke: "NL",
    target_distance_m: 100,
    target_time_ms: 65_000,
    target_pool_size: "50m",
    updated_at: "2026-04-30T00:00:00Z",
    ...overrides,
  };
}

const MOCK_SWIMMER = {
  kind: "account" as const,
  id: "account-42",
  accountId: 42,
  displayName: "Sara Dupont",
  sex: "F" as const,
};

const MOCK_SWIMMER_NO_SEX = {
  kind: "account" as const,
  id: "account-99",
  accountId: 99,
  displayName: "Pat Dupont",
  sex: null,
};

// ─── Mock jsPDF ──────────────────────────────────────────────────────────────

/**
 * Minimal jsPDF stub that outputs a fake PDF Blob.
 * All draw methods are no-ops; output("blob") returns a real Blob.
 */
class FakeJsPDF {
  setFillColor() { return this; }
  setTextColor() { return this; }
  setDrawColor() { return this; }
  setLineWidth() { return this; }
  setFont() { return this; }
  setFontSize() { return this; }
  rect() { return this; }
  roundedRect() { return this; }
  line() { return this; }
  text() { return this; }
  addPage() { return this; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lastAutoTable: any = { finalY: 50 };

  output(type: string): unknown {
    if (type === "blob") {
      // Return a real Blob with minimal PDF-like content
      return new Blob(["%PDF-1.4 fake-pdf-content-for-test"], {
        type: "application/pdf",
      });
    }
    return new Uint8Array([37, 80, 68, 70]); // %PDF
  }
}

// Stub autoTable — installs finalY on doc.lastAutoTable
function fakeAutoTable(doc: FakeJsPDF, _options: unknown): void {
  doc.lastAutoTable = { finalY: (doc.lastAutoTable?.finalY ?? 50) + 15 };
}

before(async () => {
  // Mock jspdf
  mock.module("jspdf", {
    defaultExport: FakeJsPDF,
    namedExports: { jsPDF: FakeJsPDF },
  });

  // Mock jspdf-autotable
  mock.module("jspdf-autotable", {
    defaultExport: fakeAutoTable,
    namedExports: { default: fakeAutoTable },
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("exportPacePdf — smoke tests", { skip: "jspdf-autotable ESM parse issue under node:test, see §186 Phase 7" }, () => {
  it("cible 100 NL, outputPool=50m → Blob non vide", async () => {
    const { exportPacePdf } = await import("../export-pace-pdf.ts");
    const blob = await exportPacePdf({
      swimmer: MOCK_SWIMMER,
      targets: [makeTarget({ stroke: "NL", target_distance_m: 100, target_time_ms: 65_000, target_pool_size: "50m" })],
      zones: DEFAULT_ZONES,
      strokeAdjustments: DEFAULT_ADJUSTMENTS,
      outputPool: "50m",
      coachName: "Coach Test",
    });
    assert.ok(blob instanceof Blob, "Should return a Blob");
    assert.ok(blob.size > 0, "Blob should not be empty");
  });

  it("cible 50 NL, outputPool=25m (conversion 50→25m) → Blob ok", async () => {
    const { exportPacePdf } = await import("../export-pace-pdf.ts");
    const blob = await exportPacePdf({
      swimmer: MOCK_SWIMMER,
      targets: [makeTarget({ stroke: "NL", target_distance_m: 50, target_time_ms: 30_000, target_pool_size: "50m" })],
      zones: DEFAULT_ZONES,
      strokeAdjustments: DEFAULT_ADJUSTMENTS,
      outputPool: "25m",
    });
    assert.ok(blob instanceof Blob, "Should return a Blob");
    assert.ok(blob.size > 0, "Blob should not be empty");
  });

  it("cible 200 4N → Blob non vide (4 sous-tableaux + récap)", async () => {
    const { exportPacePdf } = await import("../export-pace-pdf.ts");
    const blob = await exportPacePdf({
      swimmer: MOCK_SWIMMER,
      targets: [makeTarget({ stroke: "4N", target_distance_m: 200, target_time_ms: 130_000, target_pool_size: "50m" })],
      zones: DEFAULT_ZONES,
      strokeAdjustments: DEFAULT_ADJUSTMENTS,
      outputPool: "50m",
    });
    assert.ok(blob instanceof Blob, "Should return a Blob");
    assert.ok(blob.size > 0, "Blob should not be empty");
  });

  it("swimmer sex=null + outputPool différent → pas d'erreur, Blob ok", async () => {
    const { exportPacePdf } = await import("../export-pace-pdf.ts");
    const blob = await exportPacePdf({
      swimmer: MOCK_SWIMMER_NO_SEX,
      targets: [makeTarget({ stroke: "NL", target_distance_m: 100, target_time_ms: 65_000, target_pool_size: "25m" })],
      zones: DEFAULT_ZONES,
      strokeAdjustments: DEFAULT_ADJUSTMENTS,
      outputPool: "50m",
    });
    assert.ok(blob instanceof Blob, "Should return a Blob even with null sex");
    assert.ok(blob.size > 0, "Blob should not be empty");
  });

  it("cible 100 4N (hors table FFN) + outputPool différent → pas d'erreur, Blob ok", async () => {
    const { exportPacePdf } = await import("../export-pace-pdf.ts");
    // 100 4N is not supported as a 4N matrix (needs 200 or 400), so it will be skipped gracefully
    // But let's test with 200 4N and different pool (200 4N IS in FFN table)
    const blob = await exportPacePdf({
      swimmer: MOCK_SWIMMER,
      targets: [makeTarget({ stroke: "4N", target_distance_m: 400, target_time_ms: 270_000, target_pool_size: "25m" })],
      zones: DEFAULT_ZONES,
      strokeAdjustments: DEFAULT_ADJUSTMENTS,
      outputPool: "50m",
    });
    assert.ok(blob instanceof Blob, "Should return a Blob for 4N with pool conversion");
    assert.ok(blob.size > 0, "Blob should not be empty");
  });
});
