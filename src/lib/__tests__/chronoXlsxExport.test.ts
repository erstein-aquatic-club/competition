import { describe, it, expect } from "vitest";
import { buildSheetData, sanitizeFilename } from "../chronoXlsxExport";
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

describe("buildSheetData", () => {
  it("returns header rows even with no swimmers", () => {
    const rows = buildSheetData(fakeRecord({ label: "Vide", swimmers: [] }));
    expect(rows[0]).toEqual(["Vide"]);
    expect(rows[3]).toEqual([]);
    expect(rows[4]).toEqual(["Nageur", "Ligne", "Vague", "Type"]);
  });

  it("includes registered + manual swimmers with correct type col", () => {
    const rows = buildSheetData(fakeRecord({
      swimmers: [
        { athleteId: 10, displayName: "A", lane: 1, wave: 1, splitsByRep: [[{ distanceM: 50, cumulativeMs: 30000, lapMs: 30000 }]] },
        { athleteId: null, manualId: "u1", kind: "manual", displayName: "B", lane: 1, wave: 1, splitsByRep: [[{ distanceM: 50, cumulativeMs: 32000, lapMs: 32000 }]] },
      ],
    }));
    const dataRows = rows.slice(5);
    expect(dataRows[0][0]).toBe("A");
    expect(dataRows[0][3]).toBe("C");
    expect(dataRows[1][0]).toBe("B");
    expect(dataRows[1][3]).toBe("M");
  });

  it("formats times with centièmes precision (m:ss.cc)", () => {
    const rows = buildSheetData(fakeRecord({
      swimmers: [{ athleteId: 1, displayName: "A", lane: 1, wave: 1, splitsByRep: [[{ distanceM: 50, cumulativeMs: 65320, lapMs: 65320 }]] }],
    }));
    const dataRow = rows[5];
    expect(dataRow).toContain("1:05.32");
  });

  it("handles legacy records without kind (infers registered)", () => {
    const rows = buildSheetData(fakeRecord({
      swimmers: [{ athleteId: 42, displayName: "Legacy", lane: 1, wave: 1, splitsByRep: [] } as any],
    }));
    expect(rows[5][3]).toBe("C");
  });
});
