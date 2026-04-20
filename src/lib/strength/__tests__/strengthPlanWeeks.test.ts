import { describe, it, expect } from "vitest";
import {
  parseWeekRange,
  weekInfoFromSNumber,
  buildWeekInstances,
} from "@/lib/strength/strengthPlanWeeks";
import type { StrengthFolder, StrengthSessionTemplate } from "@/lib/api/types";

// Fixed reference date: Monday March 23, 2026 = ISO week 13
const REF_DATE = new Date(2026, 2, 23);

function makeFolder(id: number, name: string, sortOrder = 0): StrengthFolder {
  return { id, name, type: "session", sort_order: sortOrder, parent_id: null };
}

function makeCycle(id: number, name: string, parentId: number, sortOrder = 0): StrengthFolder {
  return { id, name, type: "session", sort_order: sortOrder, parent_id: parentId };
}

function makeSession(id: number, title: string, folderId: number): StrengthSessionTemplate {
  return {
    id,
    title,
    name: title,
    description: "",
    cycle: "force",
    folder_id: folderId,
    items: [{ exercise_id: 1, order_index: 0, sets: 3, reps: 8, rest_seconds: 90, percent_1rm: 75 }],
  };
}

// ── parseWeekRange ─────────────────────────────────────────────────────────

describe("parseWeekRange", () => {
  it("parses simple S13", () => {
    expect(parseWeekRange("S13 — Force")).toEqual([13, 13]);
  });

  it("parses range S13-S15", () => {
    expect(parseWeekRange("S13-S15 — Puissance")).toEqual([13, 15]);
  });

  it("returns null for non-parseable name", () => {
    expect(parseWeekRange("Semaine foo")).toBeNull();
    expect(parseWeekRange("Cycle bonus")).toBeNull();
  });

  it("parses wrap-around S52-S02", () => {
    expect(parseWeekRange("S52-S02 — Compétition")).toEqual([52, 2]);
  });
});

// ── weekInfoFromSNumber ────────────────────────────────────────────────────

describe("weekInfoFromSNumber", () => {
  it("returns correct Monday for S15 in 2026", () => {
    // REF_DATE = week 13 of 2026. S15 → April 6, 2026
    const result = weekInfoFromSNumber(15, REF_DATE);
    expect(result.weekKey).toBe("2026-04-06");
    expect(result.weekNumber).toBe(15);
  });

  it("returns correct Monday for S13 in 2026 (current week)", () => {
    const result = weekInfoFromSNumber(13, REF_DATE);
    expect(result.weekKey).toBe("2026-03-23");
    expect(result.weekNumber).toBe(13);
  });

  it("places sNum far in past into next year (wrap heuristic)", () => {
    // REF_DATE = week 13. sNum=1 < 13-26=-13? No: 1 > -13 → same year 2026
    // sNum=1 with refDate=week 40 → 1 < 40-26=14 → year+1
    const refWeek40 = new Date(2026, 9, 5); // ~Oct 5 2026 = week 40
    const result = weekInfoFromSNumber(1, refWeek40);
    expect(result.weekKey.startsWith("2027")).toBe(true);
  });
});

// ── buildWeekInstances ─────────────────────────────────────────────────────

describe("buildWeekInstances", () => {
  const root = makeFolder(1, "Mon plan");

  it("single cycle S13 with 3 sessions → 1 WeekInstance, 3 sessions", () => {
    const cycle = makeCycle(10, "S13 — Force (03/03-09/03)", 1);
    const sessions = [
      makeSession(101, "Lun — Force haut", 10),
      makeSession(102, "Mer — Force bas", 10),
      makeSession(103, "Ven — Force full", 10),
    ];
    const sessionsByFolder = new Map([[10, sessions]]);
    const result = buildWeekInstances(root, [cycle], sessionsByFolder, REF_DATE);

    expect(result).toHaveLength(1);
    expect(result[0].week.weekNumber).toBe(13);
    expect(result[0].sessions).toHaveLength(3);
    expect(result[0].phase).toBe("force");
    expect(result[0].phaseName).toBe("Force");
    expect(result[0].dateRangeLabel).toBe("03/03-09/03");
  });

  it("range cycle S13-S15 → 3 WeekInstances with same sessions duplicated", () => {
    const cycle = makeCycle(20, "S13-S15 — Puissance", 1);
    const sessions = [
      makeSession(201, "Lun — Pliométrie", 20),
      makeSession(202, "Jeu — Puissance", 20),
    ];
    const sessionsByFolder = new Map([[20, sessions]]);
    const result = buildWeekInstances(root, [cycle], sessionsByFolder, REF_DATE);

    expect(result).toHaveLength(3);
    expect(result[0].week.weekNumber).toBe(13);
    expect(result[1].week.weekNumber).toBe(14);
    expect(result[2].week.weekNumber).toBe(15);
    // All share same sessions
    for (const inst of result) {
      expect(inst.sessions).toHaveLength(2);
      expect(inst.cycleId).toBe(20);
    }
  });

  it("non-parseable cycle name → 1 fallback WeekInstance", () => {
    const cycle = makeCycle(30, "Cycle bonus", 1, 0);
    const sessions = [makeSession(301, "Lun — Exercices", 30)];
    const sessionsByFolder = new Map([[30, sessions]]);
    const result = buildWeekInstances(root, [cycle], sessionsByFolder, REF_DATE);

    // fallback = currentWeekNum(13) + idx(0) = 13
    expect(result).toHaveLength(1);
    expect(result[0].cycleShortLabel).toBe("");
  });

  it("sorts multiple cycles chronologically by weekKey", () => {
    const cycleA = makeCycle(40, "S15 — Force", 1, 1);
    const cycleB = makeCycle(41, "S13 — Reprise", 1, 0);
    const sessA = [makeSession(401, "Lun — A", 40)];
    const sessB = [makeSession(411, "Lun — B", 41)];
    const sessionsByFolder = new Map([[40, sessA], [41, sessB]]);
    const result = buildWeekInstances(root, [cycleA, cycleB], sessionsByFolder, REF_DATE);

    expect(result[0].week.weekNumber).toBe(13); // S13 first
    expect(result[1].week.weekNumber).toBe(15); // S15 second
  });

  it("sessions in a cycle are sorted by day index (Ven, Lun, Mer → Lun, Mer, Ven)", () => {
    const cycle = makeCycle(50, "S13 — Force", 1);
    const sessions = [
      makeSession(501, "Ven — Full", 50),
      makeSession(502, "Lun — Haut", 50),
      makeSession(503, "Mer — Bas", 50),
    ];
    const sessionsByFolder = new Map([[50, sessions]]);
    const result = buildWeekInstances(root, [cycle], sessionsByFolder, REF_DATE);

    expect(result[0].sessions[0].dayLabel).toBe("Lun");
    expect(result[0].sessions[1].dayLabel).toBe("Mer");
    expect(result[0].sessions[2].dayLabel).toBe("Ven");
  });

  it("sessions with items.length === 0 are excluded", () => {
    const cycle = makeCycle(60, "S13 — Force", 1);
    const sessions = [
      { ...makeSession(601, "Lun — Haut", 60), items: [] },
      makeSession(602, "Mer — Bas", 60),
    ];
    const sessionsByFolder = new Map([[60, sessions]]);
    const result = buildWeekInstances(root, [cycle], sessionsByFolder, REF_DATE);

    expect(result[0].sessions).toHaveLength(1);
    expect(result[0].sessions[0].dayLabel).toBe("Mer");
  });

  it("cycle with only empty-item sessions is skipped entirely", () => {
    const cycle = makeCycle(70, "S13 — Force", 1);
    const sessions = [{ ...makeSession(701, "Lun", 70), items: [] }];
    const sessionsByFolder = new Map([[70, sessions]]);
    const result = buildWeekInstances(root, [cycle], sessionsByFolder, REF_DATE);

    expect(result).toHaveLength(0);
  });
});
