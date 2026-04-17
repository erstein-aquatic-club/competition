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

  it("builds column defs with TOTAL + cum/lap pair per split", () => {
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
    // meta x 4, then TOTAL, [50m cum, 50m lap], [100m cum, 100m lap]
    expect(m.columnDefs.map((c) => c.kind)).toEqual([
      "meta", "meta", "meta", "meta",
      "total",
      "split-cum", "split-lap",
      "split-cum", "split-lap",
    ]);
    expect(m.columnDefs[4].label).toBe("TOTAL");
    expect(m.columnDefs[5].label).toBe("50 m cumul.");
    expect(m.columnDefs[6].label).toBe("50 m interm.");
    expect(m.columnDefs[7].label).toBe("100 m cumul.");
    expect(m.columnDefs[8].label).toBe("100 m interm.");
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
    // Per series: TOTAL, <d> cumul., <d> interm.
    expect(labels).toEqual([
      "S1 TOTAL", "S1 50 m cumul.", "S1 50 m interm.",
      "S2 TOTAL", "S2 50 m cumul.", "S2 50 m interm.",
    ]);
  });

  it("cells expose both cumul and lap per split", () => {
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
    // cells = [TOTAL, 50 cum, 50 lap, 100 cum, 100 lap]
    const [total, c50, l50, c100, l100] = m.rows[0].cells;
    expect(total).toMatchObject({ ms: 62000, isTotal: true, isLap: false });
    expect(c50).toMatchObject({ ms: 30000, isTotal: false, isLap: false });
    expect(l50).toMatchObject({ ms: 30000, isTotal: false, isLap: true });
    expect(c100).toMatchObject({ ms: 62000, isTotal: false, isLap: false });
    expect(l100).toMatchObject({ ms: 32000, isTotal: false, isLap: true });
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
    // cells[0]=S1 TOTAL, cells[1]=S1 50 cum, cells[2]=S1 50 lap, cells[3]=S2 TOTAL, cells[4]=S2 50 cum, cells[5]=S2 50 lap
    expect(m.rows[0].cells[0]).toMatchObject({ isTotal: true, isBest: false });
    expect(m.rows[0].cells[3]).toMatchObject({ isTotal: true, isBest: true });
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
    // Column layout: TOTAL, 50m cum, 50m lap, 100m cum, 100m lap (5 cells).
    // Partial has only 50m → Total=31000, 50cum=31000, 50lap=31000, 100cum=null, 100lap=null.
    const partialCells = m.rows[1].cells;
    expect(partialCells[0].ms).toBe(31000);
    expect(partialCells[1].ms).toBe(31000);
    expect(partialCells[2].ms).toBe(31000);
    expect(partialCells[3].ms).toBeNull();
    expect(partialCells[4].ms).toBeNull();
  });
});
