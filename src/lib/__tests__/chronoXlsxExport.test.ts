import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
    assert.match(sanitizeFilename("Stage / Pâques : 100m"), /^Stage-Paques-100m$/);
  });
  it("returns Chrono if empty after clean", () => {
    assert.equal(sanitizeFilename("/////"), "Chrono");
  });
  it("truncates at 80 chars", () => {
    assert.ok(sanitizeFilename("a".repeat(200)).length <= 80);
  });
});

describe("msToExcelTime", () => {
  it("converts 1 second to fraction of a day", () => {
    assert.ok(Math.abs(msToExcelTime(1000) - 1 / 86400) < 1e-10);
  });
  it("converts 0 to 0", () => {
    assert.equal(msToExcelTime(0), 0);
  });
  it("converts 1 minute to 1/1440", () => {
    assert.ok(Math.abs(msToExcelTime(60_000) - 1 / 1440) < 1e-10);
  });
});

describe("buildSheetModel", () => {
  it("returns model with no data rows when swimmers empty", () => {
    const m = buildSheetModel(fakeRecord({ label: "Vide", swimmers: [] }));
    assert.equal(m.title, "Vide");
    assert.deepEqual(m.rows, []);
    // With 0 swimmers, maxSeriesCount returns 0 → only 4 meta columns, no super-header.
    assert.equal(m.columnDefs.length, 4);
    assert.deepEqual(m.columnDefs.map((c) => c.kind), ["meta", "meta", "meta", "meta"]);
    assert.deepEqual(m.seriesGroups, []);
  });

  it("includes registered + manual swimmers and preserves kind", () => {
    const m = buildSheetModel(fakeRecord({
      swimmers: [
        { athleteId: 10, displayName: "A", lane: 1, wave: 1, splitsByRep: [[{ distanceM: 50, cumulativeMs: 30000, lapMs: 30000 }]] },
        { athleteId: null, manualId: "u1", kind: "manual", displayName: "B", lane: 1, wave: 1, splitsByRep: [[{ distanceM: 50, cumulativeMs: 32000, lapMs: 32000 }]] },
      ],
    }));
    assert.equal(m.rows.length, 2);
    assert.equal(m.rows[0].displayName, "A");
    assert.equal(m.rows[0].kind, "registered");
    assert.equal(m.rows[1].displayName, "B");
    assert.equal(m.rows[1].kind, "manual");
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
    assert.deepEqual(m.columnDefs.map((c) => c.kind), [
      "meta", "meta", "meta", "meta",
      "total",
      "split-cum", "split-lap",
      "split-cum", "split-lap",
    ]);
    assert.equal(m.columnDefs[4].label, "TOTAL");
    assert.equal(m.columnDefs[5].label, "50 m cumul.");
    assert.equal(m.columnDefs[6].label, "50 m interm.");
    assert.equal(m.columnDefs[7].label, "100 m cumul.");
    assert.equal(m.columnDefs[8].label, "100 m interm.");
  });

  it("labels stay short (no series prefix) — super-header groups identify series", () => {
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
    // Labels repeat per series — disambiguation via super-header row.
    assert.deepEqual(labels, [
      "TOTAL", "50 m cumul.", "50 m interm.",
      "TOTAL", "50 m cumul.", "50 m interm.",
    ]);
  });

  it("builds seriesGroups with col spans when nSeries > 1", () => {
    const m = buildSheetModel(fakeRecord({
      swimmers: [{
        athleteId: 1, displayName: "A", lane: 1, wave: 1,
        splitsByRep: [
          [{ distanceM: 50, cumulativeMs: 30000, lapMs: 30000 }],
          [{ distanceM: 50, cumulativeMs: 32000, lapMs: 32000 }],
        ],
      }],
    }));
    assert.deepEqual(m.seriesGroups, [
      { seriesIdx: 0, startCol: 5, endCol: 7, label: "SÉRIE 1" },
      { seriesIdx: 1, startCol: 8, endCol: 10, label: "SÉRIE 2" },
    ]);
  });

  it("seriesGroups is empty when nSeries = 1 (1-row header suffices)", () => {
    const m = buildSheetModel(fakeRecord({
      config: { totalDistanceM: 50, splitDistanceM: 50, seriesCount: 1, laneCount: 1 },
      swimmers: [{
        athleteId: 1, displayName: "A", lane: 1, wave: 1,
        splitsByRep: [[{ distanceM: 50, cumulativeMs: 30000, lapMs: 30000 }]],
      }],
    }));
    assert.deepEqual(m.seriesGroups, []);
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
    assert.equal(total.ms, 62000);
    assert.equal(total.isTotal, true);
    assert.equal(total.isLap, false);
    assert.equal(c50.ms, 30000);
    assert.equal(c50.isTotal, false);
    assert.equal(c50.isLap, false);
    assert.equal(l50.ms, 30000);
    assert.equal(l50.isTotal, false);
    assert.equal(l50.isLap, true);
    assert.equal(c100.ms, 62000);
    assert.equal(c100.isTotal, false);
    assert.equal(c100.isLap, false);
    assert.equal(l100.ms, 32000);
    assert.equal(l100.isTotal, false);
    assert.equal(l100.isLap, true);
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
    assert.equal(m.rows[0].cells[0].isTotal, true);
    assert.equal(m.rows[0].cells[0].isBest, false);
    assert.equal(m.rows[0].cells[3].isTotal, true);
    assert.equal(m.rows[0].cells[3].isBest, true);
  });

  it("does NOT mark best when only 1 completed series (no podium)", () => {
    const m = buildSheetModel(fakeRecord({
      swimmers: [{
        athleteId: 1, displayName: "A", lane: 1, wave: 1,
        splitsByRep: [[{ distanceM: 50, cumulativeMs: 30000, lapMs: 30000 }]],
      }],
    }));
    assert.equal(m.rows[0].cells[0].isBest, false);
  });

  it("handles legacy records without kind (infers registered)", () => {
    const m = buildSheetModel(fakeRecord({
      swimmers: [{ athleteId: 42, displayName: "Legacy", lane: 1, wave: 1, splitsByRep: [] } as any],
    }));
    assert.equal(m.rows[0].kind, "registered");
  });

  it("subtitle includes French date + config summary", () => {
    const m = buildSheetModel(fakeRecord({
      config: { totalDistanceM: 100, splitDistanceM: 50, seriesCount: 3, laneCount: 2 },
      created_at: "2026-04-17T10:00:00Z",
    }));
    assert.ok(m.subtitle.includes("avril"));
    assert.ok(m.subtitle.includes("3 × 100 m"));
    assert.ok(m.subtitle.includes("Splits 50 m"));
    assert.ok(m.subtitle.includes("2 lignes"));
  });

  it("title falls back to 'Chrono' if label empty", () => {
    const m = buildSheetModel(fakeRecord({ label: "" }));
    assert.equal(m.title, "Chrono");
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
    assert.equal(partialCells[0].ms, 31000);
    assert.equal(partialCells[1].ms, 31000);
    assert.equal(partialCells[2].ms, 31000);
    assert.equal(partialCells[3].ms, null);
    assert.equal(partialCells[4].ms, null);
  });
});
