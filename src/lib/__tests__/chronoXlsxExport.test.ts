import { describe, it, expect } from "vitest";
import { buildSheetModel, sanitizeFilename, msToExcelTime } from "../chronoXlsxExport";
import type { ChronoRecord } from "../api/types";

function fakeRecord(overrides: Partial<ChronoRecord> = {}): ChronoRecord {
  return {
    id: "rec-1",
    coach_id: "coach-1",
    status: "sent",
    label: "Test",
    config: { totalDistanceM: 100, splitDistanceM: 50, seriesCount: 2, laneCount: 2 },
    swimmers: [],
    created_at: "2026-04-17T10:00:00Z",
    updated_at: "2026-04-17T10:00:00Z",
    ...overrides,
  };
}

describe("sanitizeFilename", () => {
  it("strips slashes and colons", () => {
    expect(sanitizeFilename("Stage / Pâques : 100m")).toMatch(/^Stage-Paques-100m$/);
  });
  it("returns Chrono if empty after clean", () => {
    expect(sanitizeFilename("/////")).toBe("Chrono");
  });
  it("truncates at 80 chars", () => {
    expect(sanitizeFilename("a".repeat(200)).length).toBeLessThanOrEqual(80);
  });
});

describe("msToExcelTime", () => {
  it("converts 1 second to fraction of a day", () => {
    expect(msToExcelTime(1000)).toBeCloseTo(1 / 86400, 10);
  });
  it("converts 0 to 0", () => {
    expect(msToExcelTime(0)).toBe(0);
  });
  it("converts 1 minute to 1/1440", () => {
    expect(msToExcelTime(60_000)).toBeCloseTo(1 / 1440, 10);
  });
});

describe("buildSheetModel", () => {
  it("returns model with no data rows when swimmers empty", () => {
    const m = buildSheetModel(fakeRecord({ label: "Vide", swimmers: [] }));
    expect(m.title).toBe("Vide");
    expect(m.rows).toEqual([]);
    // With 0 swimmers, maxSeriesCount returns 0 → only 4 meta columns
    expect(m.columnDefs).toHaveLength(4);
    expect(m.columnDefs.map((c) => c.kind)).toEqual(["meta", "meta", "meta", "meta"]);
  });

  it("includes registered + manual swimmers and preserves kind", () => {
    const m = buildSheetModel(fakeRecord({
      swimmers: [
        { athleteId: 10, displayName: "A", lane: 1, wave: 1, splitsByRep: [[{ distanceM: 50, cumulativeMs: 30000, lapMs: 30000 }]] },
        { athleteId: null, manualId: "u1", kind: "manual", displayName: "B", lane: 1, wave: 1, splitsByRep: [[{ distanceM: 50, cumulativeMs: 32000, lapMs: 32000 }]] },
      ],
    }));
    expect(m.rows).toHaveLength(2);
    expect(m.rows[0]).toMatchObject({ displayName: "A", kind: "registered" });
    expect(m.rows[1]).toMatchObject({ displayName: "B", kind: "manual" });
  });

  it("builds column defs in order: 4 meta then total + splits per series", () => {
    const m = buildSheetModel(fakeRecord({
      config: { totalDistanceM: 100, splitDistanceM: 50, seriesCount: 1, laneCount: 1 },
      swimmers: [{
        athleteId: 1, displayName: "A", lane: 1, wave: 1,
        splitsByRep: [[
          { distanceM: 50, cumulativeMs: 30000, lapMs: 30000 },
          { distanceM: 100, cumulativeMs: 62000, lapMs: 32000 },
        ]],
      }],
    }));
    // meta x 4, then S1 TOTAL, S1 50m, S1 100m
    expect(m.columnDefs.map((c) => c.kind)).toEqual(["meta", "meta", "meta", "meta", "total", "split", "split"]);
    expect(m.columnDefs[4].label).toBe("TOTAL");
    expect(m.columnDefs[5].label).toBe("50 m");
    expect(m.columnDefs[6].label).toBe("100 m");
  });

  it("prefixes series index in labels when multiple series", () => {
    const m = buildSheetModel(fakeRecord({
      swimmers: [{
        athleteId: 1, displayName: "A", lane: 1, wave: 1,
        splitsByRep: [
          [{ distanceM: 50, cumulativeMs: 30000, lapMs: 30000 }],
          [{ distanceM: 50, cumulativeMs: 32000, lapMs: 32000 }],
        ],
      }],
    }));
    const labels = m.columnDefs.slice(4).map((c) => c.label);
    expect(labels).toEqual(["S1 TOTAL", "S1 50 m", "S2 TOTAL", "S2 50 m"]);
  });

  it("marks best series total (fastest) when 2+ completed series", () => {
    const m = buildSheetModel(fakeRecord({
      swimmers: [{
        athleteId: 1, displayName: "A", lane: 1, wave: 1,
        splitsByRep: [
          [{ distanceM: 50, cumulativeMs: 30000, lapMs: 30000 }],
          [{ distanceM: 50, cumulativeMs: 28000, lapMs: 28000 }],  // faster
        ],
      }],
    }));
    const [s1Total, _s1Split, s2Total, _s2Split] = m.rows[0].cells;
    expect(s1Total).toMatchObject({ isTotal: true, isBest: false });
    expect(s2Total).toMatchObject({ isTotal: true, isBest: true });
  });

  it("does NOT mark best when only 1 completed series (no podium)", () => {
    const m = buildSheetModel(fakeRecord({
      swimmers: [{
        athleteId: 1, displayName: "A", lane: 1, wave: 1,
        splitsByRep: [[{ distanceM: 50, cumulativeMs: 30000, lapMs: 30000 }]],
      }],
    }));
    expect(m.rows[0].cells[0].isBest).toBe(false);
  });

  it("handles legacy records without kind (infers registered)", () => {
    const m = buildSheetModel(fakeRecord({
      swimmers: [{ athleteId: 42, displayName: "Legacy", lane: 1, wave: 1, splitsByRep: [] } as any],
    }));
    expect(m.rows[0].kind).toBe("registered");
  });

  it("subtitle includes French date + config summary", () => {
    const m = buildSheetModel(fakeRecord({
      config: { totalDistanceM: 100, splitDistanceM: 50, seriesCount: 3, laneCount: 2 },
      created_at: "2026-04-17T10:00:00Z",
    }));
    expect(m.subtitle).toContain("avril");
    expect(m.subtitle).toContain("3 × 100 m");
    expect(m.subtitle).toContain("Splits 50 m");
    expect(m.subtitle).toContain("2 lignes");
  });

  it("title falls back to 'Chrono' if label empty", () => {
    const m = buildSheetModel(fakeRecord({ label: "" }));
    expect(m.title).toBe("Chrono");
  });

  it("cells have null ms when split missing (e.g. partial series)", () => {
    const m = buildSheetModel(fakeRecord({
      config: { totalDistanceM: 100, splitDistanceM: 50, seriesCount: 1, laneCount: 2 },
      swimmers: [
        { athleteId: 1, displayName: "Full", lane: 1, wave: 1, splitsByRep: [[
          { distanceM: 50, cumulativeMs: 30000, lapMs: 30000 },
          { distanceM: 100, cumulativeMs: 62000, lapMs: 32000 },
        ]]},
        { athleteId: 2, displayName: "Partial", lane: 2, wave: 1, splitsByRep: [[
          { distanceM: 50, cumulativeMs: 31000, lapMs: 31000 },  // only 1 split
        ]]},
      ],
    }));
    // Column layout for "Partial": TOTAL, 50m, 100m (3 cells).
    // Total = last split (31000), 50m = 31000, 100m = null.
    const partialCells = m.rows[1].cells;
    expect(partialCells[0].ms).toBe(31000);
    expect(partialCells[1].ms).toBe(31000);
    expect(partialCells[2].ms).toBeNull();
  });
});
