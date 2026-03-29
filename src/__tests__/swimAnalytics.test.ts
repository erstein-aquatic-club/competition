import { describe, expect, it } from "vitest";
import type { SwimBlock } from "../lib/swimTextParser";
import {
  aggregateByWeek,
  classifyWorkType,
  computeSessionVolume,
  normalizeStroke,
  type SwimVolumeEntry,
} from "../lib/swimAnalytics";

// ── normalizeStroke ──

describe("normalizeStroke", () => {
  it("maps crawl/nl/nage libre to NL", () => {
    expect(normalizeStroke("crawl")).toBe("NL");
    expect(normalizeStroke("nl")).toBe("NL");
    expect(normalizeStroke("NL")).toBe("NL");
    expect(normalizeStroke("nage libre")).toBe("NL");
  });

  it("maps dos to DOS", () => {
    expect(normalizeStroke("dos")).toBe("DOS");
    expect(normalizeStroke("Dos")).toBe("DOS");
  });

  it("maps brasse/br to BR", () => {
    expect(normalizeStroke("brasse")).toBe("BR");
    expect(normalizeStroke("br")).toBe("BR");
    expect(normalizeStroke("BR")).toBe("BR");
  });

  it("maps papillon/pap to PAP", () => {
    expect(normalizeStroke("papillon")).toBe("PAP");
    expect(normalizeStroke("pap")).toBe("PAP");
    expect(normalizeStroke("PAP")).toBe("PAP");
  });

  it("maps 4n/qn/quatre nages to QN", () => {
    expect(normalizeStroke("4n")).toBe("QN");
    expect(normalizeStroke("qn")).toBe("QN");
    expect(normalizeStroke("QN")).toBe("QN");
    expect(normalizeStroke("quatre nages")).toBe("QN");
    expect(normalizeStroke("4 nages")).toBe("QN");
  });

  it("maps educ/éducatif to EDU", () => {
    expect(normalizeStroke("educ")).toBe("EDU");
    expect(normalizeStroke("éducatif")).toBe("EDU");
    expect(normalizeStroke("educatif")).toBe("EDU");
  });

  it("returns MIXTE for unknown strokes", () => {
    expect(normalizeStroke("")).toBe("MIXTE");
    expect(normalizeStroke("unknown")).toBe("MIXTE");
    expect(normalizeStroke("ondulation")).toBe("MIXTE");
  });
});

// ── classifyWorkType ──

describe("classifyWorkType", () => {
  it("V0 → endurance", () => {
    expect(classifyWorkType({ intensity: "V0" })).toBe("endurance");
  });

  it("V1 → endurance", () => {
    expect(classifyWorkType({ intensity: "V1" })).toBe("endurance");
  });

  it("V2 → mixte", () => {
    expect(classifyWorkType({ intensity: "V2" })).toBe("mixte");
  });

  it("V3 → vitesse", () => {
    expect(classifyWorkType({ intensity: "V3" })).toBe("vitesse");
  });

  it("Max → vitesse", () => {
    expect(classifyWorkType({ intensity: "Max" })).toBe("vitesse");
  });

  it("Prog → mixte", () => {
    expect(classifyWorkType({ intensity: "Prog" })).toBe("mixte");
  });

  it("strokeType educ → technique (overrides intensity)", () => {
    expect(classifyWorkType({ intensity: "V3", strokeType: "educ" })).toBe("technique");
  });

  it("strokeType with éduc → technique", () => {
    expect(classifyWorkType({ strokeType: "éducatif" })).toBe("technique");
  });

  it("strokeType technique → technique", () => {
    expect(classifyWorkType({ strokeType: "technique" })).toBe("technique");
  });

  it("defaults to mixte when no intensity/strokeType", () => {
    expect(classifyWorkType({})).toBe("mixte");
  });
});

// ── computeSessionVolume ──

describe("computeSessionVolume", () => {
  it("computes volume for a known set of blocks", () => {
    const blocks: SwimBlock[] = [
      {
        title: "Bloc 1",
        repetitions: 1,
        description: "",
        modalities: "",
        equipment: [],
        exercises: [
          {
            repetitions: 2,
            distance: 400,
            rest: null,
            restType: "rest",
            stroke: "crawl",
            strokeType: "nc",
            intensity: "V1",
            modalities: "",
            equipment: [],
          },
        ],
      },
      {
        title: "Bloc 2",
        repetitions: 1,
        description: "",
        modalities: "",
        equipment: [],
        exercises: [
          {
            repetitions: 4,
            distance: 100,
            rest: null,
            restType: "rest",
            stroke: "pap",
            strokeType: "nc",
            intensity: "Max",
            modalities: "",
            equipment: [],
          },
        ],
      },
    ];

    const result = computeSessionVolume(blocks);

    expect(result.totalMeters).toBe(1200);
    expect(result.byStroke.NL).toBe(800);
    expect(result.byStroke.PAP).toBe(400);
    expect(result.byType.endurance).toBe(800);
    expect(result.byType.vitesse).toBe(400);
    expect(result.byIntensity.V1).toBe(800);
    expect(result.byIntensity.Max).toBe(400);
  });

  it("handles block repetitions", () => {
    const blocks: SwimBlock[] = [
      {
        title: "Bloc 1",
        repetitions: 3,
        description: "",
        modalities: "",
        equipment: [],
        exercises: [
          {
            repetitions: 2,
            distance: 100,
            rest: null,
            restType: "rest",
            stroke: "dos",
            strokeType: "nc",
            intensity: "V2",
            modalities: "",
            equipment: [],
          },
        ],
      },
    ];

    const result = computeSessionVolume(blocks);

    // 2 * 100 * 3 = 600
    expect(result.totalMeters).toBe(600);
    expect(result.byStroke.DOS).toBe(600);
    expect(result.byType.mixte).toBe(600);
  });

  it("returns zeros for empty blocks array", () => {
    const result = computeSessionVolume([]);

    expect(result.totalMeters).toBe(0);
    expect(Object.keys(result.byStroke)).toHaveLength(0);
    expect(Object.keys(result.byType)).toHaveLength(0);
    expect(Object.keys(result.byIntensity)).toHaveLength(0);
  });

  it("skips exercises with null distance", () => {
    const blocks: SwimBlock[] = [
      {
        title: "Bloc 1",
        repetitions: 1,
        description: "",
        modalities: "",
        equipment: [],
        exercises: [
          {
            repetitions: 1,
            distance: null,
            rest: null,
            restType: "rest",
            stroke: "crawl",
            strokeType: "nc",
            intensity: "V1",
            modalities: "",
            equipment: [],
          },
          {
            repetitions: 1,
            distance: 200,
            rest: null,
            restType: "rest",
            stroke: "brasse",
            strokeType: "nc",
            intensity: "V0",
            modalities: "",
            equipment: [],
          },
        ],
      },
    ];

    const result = computeSessionVolume(blocks);

    expect(result.totalMeters).toBe(200);
    expect(result.byStroke.BR).toBe(200);
  });

  it("classifies educ strokeType as technique", () => {
    const blocks: SwimBlock[] = [
      {
        title: "Bloc 1",
        repetitions: 1,
        description: "",
        modalities: "",
        equipment: [],
        exercises: [
          {
            repetitions: 4,
            distance: 50,
            rest: null,
            restType: "rest",
            stroke: "crawl",
            strokeType: "educ",
            intensity: "V1",
            modalities: "",
            equipment: [],
          },
        ],
      },
    ];

    const result = computeSessionVolume(blocks);

    expect(result.totalMeters).toBe(200);
    expect(result.byType.technique).toBe(200);
  });
});

// ── aggregateByWeek ──

describe("aggregateByWeek", () => {
  it("merges entries in the same week", () => {
    const entries: SwimVolumeEntry[] = [
      {
        date: "2026-03-23", // Monday
        totalMeters: 3000,
        byStroke: { NL: 2000, DOS: 1000 },
        byType: { endurance: 2000, vitesse: 1000 },
        byIntensity: { V1: 2000, V3: 1000 },
      },
      {
        date: "2026-03-25", // Wednesday same week
        totalMeters: 2000,
        byStroke: { NL: 1000, PAP: 1000 },
        byType: { endurance: 1000, technique: 1000 },
        byIntensity: { V1: 1000, V0: 1000 },
      },
    ];

    const result = aggregateByWeek(entries);

    expect(result).toHaveLength(1);
    expect(result[0].weekStart).toBe("2026-03-23");
    expect(result[0].totalMeters).toBe(5000);
    expect(result[0].byStroke.NL).toBe(3000);
    expect(result[0].byStroke.DOS).toBe(1000);
    expect(result[0].byStroke.PAP).toBe(1000);
    expect(result[0].byType.endurance).toBe(3000);
    expect(result[0].byType.vitesse).toBe(1000);
    expect(result[0].byType.technique).toBe(1000);
  });

  it("separates entries from different weeks", () => {
    const entries: SwimVolumeEntry[] = [
      {
        date: "2026-03-23", // Week of March 23
        totalMeters: 3000,
        byStroke: { NL: 3000 },
        byType: { endurance: 3000 },
        byIntensity: { V1: 3000 },
      },
      {
        date: "2026-03-30", // Week of March 30
        totalMeters: 2000,
        byStroke: { NL: 2000 },
        byType: { endurance: 2000 },
        byIntensity: { V1: 2000 },
      },
    ];

    const result = aggregateByWeek(entries);

    expect(result).toHaveLength(2);
    expect(result[0].weekStart).toBe("2026-03-23");
    expect(result[0].totalMeters).toBe(3000);
    expect(result[1].weekStart).toBe("2026-03-30");
    expect(result[1].totalMeters).toBe(2000);
  });

  it("returns sorted by weekStart ascending", () => {
    const entries: SwimVolumeEntry[] = [
      {
        date: "2026-03-30",
        totalMeters: 1000,
        byStroke: {},
        byType: {},
        byIntensity: {},
      },
      {
        date: "2026-03-16",
        totalMeters: 2000,
        byStroke: {},
        byType: {},
        byIntensity: {},
      },
      {
        date: "2026-03-23",
        totalMeters: 1500,
        byStroke: {},
        byType: {},
        byIntensity: {},
      },
    ];

    const result = aggregateByWeek(entries);

    expect(result).toHaveLength(3);
    expect(result[0].weekStart).toBe("2026-03-16");
    expect(result[1].weekStart).toBe("2026-03-23");
    expect(result[2].weekStart).toBe("2026-03-30");
  });

  it("handles Sunday correctly (belongs to previous Monday)", () => {
    const entries: SwimVolumeEntry[] = [
      {
        date: "2026-03-29", // Sunday → Monday is March 23
        totalMeters: 1000,
        byStroke: { NL: 1000 },
        byType: { endurance: 1000 },
        byIntensity: { V1: 1000 },
      },
    ];

    const result = aggregateByWeek(entries);

    expect(result).toHaveLength(1);
    expect(result[0].weekStart).toBe("2026-03-23");
  });

  it("returns empty array for empty input", () => {
    expect(aggregateByWeek([])).toEqual([]);
  });
});
