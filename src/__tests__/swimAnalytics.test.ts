import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
    assert.equal(normalizeStroke("crawl"), "NL");
    assert.equal(normalizeStroke("nl"), "NL");
    assert.equal(normalizeStroke("NL"), "NL");
    assert.equal(normalizeStroke("nage libre"), "NL");
  });

  it("maps dos to DOS", () => {
    assert.equal(normalizeStroke("dos"), "DOS");
    assert.equal(normalizeStroke("Dos"), "DOS");
  });

  it("maps brasse/br to BR", () => {
    assert.equal(normalizeStroke("brasse"), "BR");
    assert.equal(normalizeStroke("br"), "BR");
    assert.equal(normalizeStroke("BR"), "BR");
  });

  it("maps papillon/pap to PAP", () => {
    assert.equal(normalizeStroke("papillon"), "PAP");
    assert.equal(normalizeStroke("pap"), "PAP");
    assert.equal(normalizeStroke("PAP"), "PAP");
  });

  it("maps 4n/qn/quatre nages to QN", () => {
    assert.equal(normalizeStroke("4n"), "QN");
    assert.equal(normalizeStroke("qn"), "QN");
    assert.equal(normalizeStroke("QN"), "QN");
    assert.equal(normalizeStroke("quatre nages"), "QN");
    assert.equal(normalizeStroke("4 nages"), "QN");
  });

  it("maps educ/éducatif to EDU", () => {
    assert.equal(normalizeStroke("educ"), "EDU");
    assert.equal(normalizeStroke("éducatif"), "EDU");
    assert.equal(normalizeStroke("educatif"), "EDU");
  });

  it("returns MIXTE for unknown strokes", () => {
    assert.equal(normalizeStroke(""), "MIXTE");
    assert.equal(normalizeStroke("unknown"), "MIXTE");
    assert.equal(normalizeStroke("ondulation"), "MIXTE");
  });
});

// ── classifyWorkType ──

describe("classifyWorkType", () => {
  it("V0 → endurance", () => {
    assert.equal(classifyWorkType({ intensity: "V0" }), "endurance");
  });

  it("V1 → endurance", () => {
    assert.equal(classifyWorkType({ intensity: "V1" }), "endurance");
  });

  it("V2 → mixte", () => {
    assert.equal(classifyWorkType({ intensity: "V2" }), "mixte");
  });

  it("V3 → vitesse", () => {
    assert.equal(classifyWorkType({ intensity: "V3" }), "vitesse");
  });

  it("Max → vitesse", () => {
    assert.equal(classifyWorkType({ intensity: "Max" }), "vitesse");
  });

  it("Prog → mixte", () => {
    assert.equal(classifyWorkType({ intensity: "Prog" }), "mixte");
  });

  it("strokeType educ → technique (overrides intensity)", () => {
    assert.equal(classifyWorkType({ intensity: "V3", strokeType: "educ" }), "technique");
  });

  it("strokeType with éduc → technique", () => {
    assert.equal(classifyWorkType({ strokeType: "éducatif" }), "technique");
  });

  it("strokeType technique → technique", () => {
    assert.equal(classifyWorkType({ strokeType: "technique" }), "technique");
  });

  it("defaults to mixte when no intensity/strokeType", () => {
    assert.equal(classifyWorkType({}), "mixte");
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

    assert.equal(result.totalMeters, 1200);
    assert.equal(result.byStroke.NL, 800);
    assert.equal(result.byStroke.PAP, 400);
    assert.equal(result.byType.endurance, 800);
    assert.equal(result.byType.vitesse, 400);
    assert.equal(result.byIntensity.V1, 800);
    assert.equal(result.byIntensity.Max, 400);
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
    assert.equal(result.totalMeters, 600);
    assert.equal(result.byStroke.DOS, 600);
    assert.equal(result.byType.mixte, 600);
  });

  it("returns zeros for empty blocks array", () => {
    const result = computeSessionVolume([]);

    assert.equal(result.totalMeters, 0);
    assert.equal((Object.keys(result.byStroke)).length, 0);
    assert.equal((Object.keys(result.byType)).length, 0);
    assert.equal((Object.keys(result.byIntensity)).length, 0);
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

    assert.equal(result.totalMeters, 200);
    assert.equal(result.byStroke.BR, 200);
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

    assert.equal(result.totalMeters, 200);
    assert.equal(result.byType.technique, 200);
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

    assert.equal((result).length, 1);
    assert.equal(result[0].weekStart, "2026-03-23");
    assert.equal(result[0].totalMeters, 5000);
    assert.equal(result[0].byStroke.NL, 3000);
    assert.equal(result[0].byStroke.DOS, 1000);
    assert.equal(result[0].byStroke.PAP, 1000);
    assert.equal(result[0].byType.endurance, 3000);
    assert.equal(result[0].byType.vitesse, 1000);
    assert.equal(result[0].byType.technique, 1000);
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

    assert.equal((result).length, 2);
    assert.equal(result[0].weekStart, "2026-03-23");
    assert.equal(result[0].totalMeters, 3000);
    assert.equal(result[1].weekStart, "2026-03-30");
    assert.equal(result[1].totalMeters, 2000);
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

    assert.equal((result).length, 3);
    assert.equal(result[0].weekStart, "2026-03-16");
    assert.equal(result[1].weekStart, "2026-03-23");
    assert.equal(result[2].weekStart, "2026-03-30");
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

    assert.equal((result).length, 1);
    assert.equal(result[0].weekStart, "2026-03-23");
  });

  it("returns empty array for empty input", () => {
    assert.deepEqual(aggregateByWeek([]), []);
  });
});
