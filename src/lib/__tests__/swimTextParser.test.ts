import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  classifyLine,
  parseExerciseTokens,
  parseRestToken,
  parseTimeNotation,
  parseSwimText,
  normalizeIntensityValue,
  normalizeEquipmentValue,
  detectTextWarnings,
} from "@/lib/swimTextParser";

// ── classifyLine ──

describe("classifyLine", () => {
  test("empty line", () => {
    assert.equal(classifyLine("").type, "empty");
    assert.equal(classifyLine("   ").type, "empty");
  });

  test("block_rep: x2, x3", () => {
    assert.equal(classifyLine("x2").type, "block_rep");
    assert.equal(classifyLine("x3").type, "block_rep");
    assert.equal(classifyLine("x2 (4*200 Cr V0 W relachement r : 20'' + r : 1'00) mat. AC").type, "block_rep");
  });

  test("block_rep: Nx (...) — digit-first form", () => {
    assert.equal(classifyLine("3x  (1x papillon 1x dos 1x crawl)").type, "block_rep");
    assert.equal(classifyLine("2x (4*100 Cr V2)").type, "block_rep");
  });

  test("exercise: Nx without parens stays exercise", () => {
    assert.equal(classifyLine("8x 50 d:55''").type, "exercise");
    assert.equal(classifyLine("16x 25 + PC papillon d:35''").type, "exercise");
  });

  test("exercise: starts with digit", () => {
    assert.equal(classifyLine("400").type, "exercise");
    assert.equal(classifyLine("3*100 spé r : 10''").type, "exercise");
    assert.equal(classifyLine("6*50 jbes spé r : 10''").type, "exercise");
    assert.equal(classifyLine("800 (100 Cr / 100 D pull)").type, "exercise");
  });

  test("sub_detail: starts with #", () => {
    assert.equal(classifyLine("#150 Cr").type, "sub_detail");
    assert.equal(classifyLine("#1 : NAC V0").type, "sub_detail");
    assert.equal(classifyLine("#1-3 : jbes V1").type, "sub_detail");
    assert.equal(classifyLine("#25 Educ").type, "sub_detail");
  });

  test("continuation: starts with +", () => {
    assert.equal(classifyLine("+ 200 EZ").type, "continuation");
    assert.equal(classifyLine("+ 3*400").type, "continuation");
  });

  test("annotation: S1 :, B1 :", () => {
    assert.equal(classifyLine("S1 :").type, "annotation");
    assert.equal(classifyLine("B1 : 1* V2 - 1* V1  - 1* V2 - 3*V1").type, "annotation");
    assert.equal(classifyLine("B2 : 1↗︎3 (2 en 2)").type, "annotation");
  });

  test("unparsed: text lines", () => {
    assert.equal(classifyLine("Total : 4400m").type, "unparsed");
    assert.equal(classifyLine("W DP relais").type, "unparsed");
  });
});

// ── parseTimeNotation ──

describe("parseTimeNotation", () => {
  test("seconds: 10''", () => {
    assert.equal(parseTimeNotation("10''"), 10);
  });

  test("seconds: 60''", () => {
    assert.equal(parseTimeNotation("60''"), 60);
  });

  test("min'sec: 1'00", () => {
    assert.equal(parseTimeNotation("1'00"), 60);
  });

  test("min'sec: 1'45", () => {
    assert.equal(parseTimeNotation("1'45"), 105);
  });

  test("min'sec: 2'10", () => {
    assert.equal(parseTimeNotation("2'10"), 130);
  });
});

// ── parseRestToken ──

describe("parseRestToken", () => {
  test("repos: r : 10''", () => {
    const result = parseRestToken(["r", ":", "10''"]);
    assert.deepEqual(result, { rest: 10, restType: "rest" });
  });

  test("repos: r : 1'00", () => {
    const result = parseRestToken(["r", ":", "1'00"]);
    assert.deepEqual(result, { rest: 60, restType: "rest" });
  });

  test("repos: r :20''", () => {
    const result = parseRestToken(["r", ":20''"]);
    assert.deepEqual(result, { rest: 20, restType: "rest" });
  });

  test("departure: @ 60''", () => {
    const result = parseRestToken(["@", "60''"]);
    assert.deepEqual(result, { rest: 60, restType: "departure" });
  });

  test("departure: @ 1'45", () => {
    const result = parseRestToken(["@", "1'45"]);
    assert.deepEqual(result, { rest: 105, restType: "departure" });
  });

  test("departure: d : 1'50", () => {
    const result = parseRestToken(["d", ":", "1'50"]);
    assert.deepEqual(result, { rest: 110, restType: "departure" });
  });
});

// ── parseExerciseTokens ──

describe("parseExerciseTokens", () => {
  test("3*100 spé r : 10''", () => {
    const result = parseExerciseTokens("3*100 spé r : 10''");
    assert.equal(result.repetitions, 3);
    assert.equal(result.distance, 100);
    assert.equal(result.stroke, "spe");
    assert.equal(result.rest, 10);
    assert.equal(result.restType, "rest");
  });

  test("6*50 jbes spé r : 10''", () => {
    const result = parseExerciseTokens("6*50 jbes spé r : 10''");
    assert.equal(result.repetitions, 6);
    assert.equal(result.distance, 50);
    assert.equal(result.stroke, "spe");
    assert.equal(result.strokeType, "jambes");
  });

  test("400 solo distance", () => {
    const result = parseExerciseTokens("400");
    assert.equal(result.repetitions, 1);
    assert.equal(result.distance, 400);
  });

  test("300 Cr EZ", () => {
    const result = parseExerciseTokens("300 Cr EZ");
    assert.equal(result.distance, 300);
    assert.equal(result.stroke, "crawl");
    assert.equal(result.intensity, "V0");
  });

  test("12*100 spé V3 @ 1'45", () => {
    const result = parseExerciseTokens("12*100 spé V3 @ 1'45");
    assert.equal(result.repetitions, 12);
    assert.equal(result.distance, 100);
    assert.equal(result.stroke, "spe");
    assert.equal(result.intensity, "V3");
    assert.equal(result.rest, 105);
    assert.equal(result.restType, "departure");
  });

  test("400 spé plaq Éduc W d'appuis", () => {
    const result = parseExerciseTokens("400 spé plaq Éduc W d'appuis");
    assert.equal(result.distance, 400);
    assert.equal(result.stroke, "spe");
    assert.equal(result.strokeType, "educ");
    assert.ok(result.equipment.includes("plaquettes"));
    assert.ok(result.modalities.includes("W d'appuis"));
  });

  test("6*100 Cr tuba V1↗︎ @ 1'25 / 1'30", () => {
    const result = parseExerciseTokens("6*100 Cr tuba V1↗︎ @ 1'25 / 1'30");
    assert.equal(result.repetitions, 6);
    assert.equal(result.distance, 100);
    assert.equal(result.stroke, "crawl");
    assert.ok(result.equipment.includes("tuba"));
    assert.equal(result.intensity, "Prog");
    assert.equal(result.rest, 85); // 1'25 = 85s
    assert.equal(result.restType, "departure");
  });

  test("D2B is NOT parsed as dos stroke", () => {
    const result = parseExerciseTokens("50 D2B");
    assert.notEqual(result.stroke, "dos");
  });

  test("DP is NOT parsed as dos stroke", () => {
    const result = parseExerciseTokens("8*50 spé V3 (1° DP) @ 55''");
    assert.equal(result.stroke, "spe");
    assert.notEqual(result.stroke, "dos");
  });

  test("800 (100 Cr / 100 Cr-D pull)", () => {
    const result = parseExerciseTokens("800 (100 Cr / 100 Cr-D pull)");
    assert.equal(result.distance, 800);
    assert.ok(result.modalities.includes("100 Cr / 100 Cr-D pull"));
  });

  test("100 4N V0 ampli", () => {
    const result = parseExerciseTokens("100 4N V0 ampli");
    assert.equal(result.distance, 100);
    assert.equal(result.stroke, "4n");
    assert.equal(result.intensity, "V0");
    assert.ok(result.modalities.includes("ampli"));
  });

  test("3*100 jbes spé d : 1'50 / 2'00 w virages", () => {
    const result = parseExerciseTokens("3*100 jbes spé d : 1'50 / 2'00 w virages");
    assert.equal(result.repetitions, 3);
    assert.equal(result.distance, 100);
    assert.equal(result.strokeType, "jambes");
    assert.equal(result.rest, 110);
    assert.equal(result.restType, "departure");
  });
});

// ── normalizeIntensityValue ──

describe("normalizeIntensityValue", () => {
  test("EZ → V0", () => {
    assert.equal(normalizeIntensityValue("EZ"), "V0");
  });

  test("VMax → Max", () => {
    assert.equal(normalizeIntensityValue("VMax"), "Max");
  });

  test("souple → V0", () => {
    assert.equal(normalizeIntensityValue("souple"), "V0");
  });

  test("Prog → Prog", () => {
    assert.equal(normalizeIntensityValue("Prog"), "Prog");
  });

  test("null → V0", () => {
    assert.equal(normalizeIntensityValue(null), "V0");
  });

  test("V3 → V3", () => {
    assert.equal(normalizeIntensityValue("V3"), "V3");
  });
});

// ── normalizeEquipmentValue ──

describe("normalizeEquipmentValue", () => {
  test("plaq → plaquettes", () => {
    assert.equal(normalizeEquipmentValue("plaq"), "plaquettes");
  });

  test("palmes → palmes", () => {
    assert.equal(normalizeEquipmentValue("palmes"), "palmes");
  });

  test("tuba → tuba", () => {
    assert.equal(normalizeEquipmentValue("tuba"), "tuba");
  });

  test("pull → pull", () => {
    assert.equal(normalizeEquipmentValue("pull"), "pull");
  });
});

// ── Integration: parseSwimText with examples ──

describe("parseSwimText", () => {
  test("empty string → empty array", () => {
    assert.deepEqual(parseSwimText(""), []);
    assert.deepEqual(parseSwimText("   "), []);
  });

  test("Example 1: basic session with sub-details", () => {
    const text = `400
#150 Cr
#50 D
300 Cr pull respi 3-5-7 temps
200 Cr
#25 Educ
#25 V1`;

    const blocks = parseSwimText(text);
    assert.ok(blocks.length >= 1, `Expected at least 1 block, got ${blocks.length}`);

    const b = blocks[0];
    // 400 kept as parent with sub-details as modalities
    // + 300 Cr pull + 200 kept as parent with sub-details as modalities
    assert.ok(b.exercises.length >= 3, `Expected at least 3 exercises, got ${b.exercises.length}`);

    // 400 crawl with sub-detail annotations
    assert.equal(b.exercises[0].distance, 400);
    assert.equal(b.exercises[0].stroke, "crawl");
    assert.ok(b.exercises[0].modalities.includes("150 Cr"), "should have 150 Cr in modalities");
    assert.ok(b.exercises[0].modalities.includes("50 D"), "should have 50 D in modalities");

    // 300 Cr pull
    assert.equal(b.exercises[1].distance, 300);
    assert.equal(b.exercises[1].stroke, "crawl");
    assert.ok(b.exercises[1].equipment.includes("pull"));

    // 200 Cr with sub-detail annotations
    assert.equal(b.exercises[2].distance, 200);
    assert.equal(b.exercises[2].stroke, "crawl");
    assert.ok(b.exercises[2].modalities.includes("25 Educ"), "should have 25 Educ in modalities");
    assert.ok(b.exercises[2].modalities.includes("25 V1"), "should have 25 V1 in modalities");
  });

  test("Example 2: multiple blocks with xN, rest, continuation", () => {
    const text = `300 Cr EZ
3*100 spé r : 10''
#50 Éduc
#50 V1
6*50 jbes spé r : 10''

x2 (4*200 Cr V0 W relachement r : 20'' + r : 1'00) mat. AC

x3
100 jbes spé
3*50 Éduc
1*50 NC
#25 VAcc
#25 D2B

4*100 r : 20''
#1 : NAC V0
#2 : spé V2

400 spé plaq Éduc W d'appuis
+ 200 EZ

Total : 4400m`;

    const blocks = parseSwimText(text);
    assert.ok(blocks.length >= 4, `Expected at least 4 blocks, got ${blocks.length}`);

    // Block 1: warmup
    const b1 = blocks[0];
    assert.ok(b1.exercises.length >= 3, `Block 1: expected at least 3 exercises, got ${b1.exercises.length}`);
    assert.equal(b1.exercises[0].distance, 300);
    assert.equal(b1.exercises[0].intensity, "V0"); // EZ → V0

    // Block 2: x2 with parens
    const b2 = blocks[1];
    assert.equal(b2.repetitions, 2);

    // Block 3: x3
    const x3Block = blocks.find((b) => b.repetitions === 3);
    assert.ok(x3Block, "Should have a block with repetitions=3");
    assert.ok(x3Block.exercises.length >= 2, "x3 block should have exercises");

    // Last real block: 400 spé plaq Éduc + 200 EZ
    const lastBlock = blocks[blocks.length - 1];
    assert.ok(lastBlock.exercises.length >= 2, "Last block should have 400 + 200");
    assert.ok(lastBlock.exercises.some((e) => e.distance === 400));
    assert.ok(lastBlock.exercises.some((e) => e.distance === 200));
  });

  test("Example 3: departures with @, nested sub-details", () => {
    const text = `300 EZ AC CP
6*50 jbes spé W couléée, R2N @ 60''
3*100 Éduc spé r : 15''

12*100 spé V3 @ 1'45
+ 3*400
#1 : EZ AC NC
#2 : Cr V0 tuba plaq 1/2 pull ou palmes
#3 : 8*50 @ 60''
    #1-3 : jbes spé V1 @ 60''
    #4 : 15 spé Vmax DP / 35 EZ

300 Éduc / NC spé

x3
8*50 spé V3 (1° DP) @ 55''
+ 100 D2B @ 3'00

8*100 Cr / D pull ou palmes r : 15''
#1 : NC V0
#2-3 : jbes V1
#4-8 : NC V0`;

    const blocks = parseSwimText(text);
    assert.ok(blocks.length >= 4, `Expected at least 4 blocks, got ${blocks.length}`);

    // Block 1: warmup
    assert.equal(blocks[0].exercises[0].distance, 300);
    assert.equal(blocks[0].exercises[0].intensity, "V0"); // EZ → V0

    // 6*50 departure @ 60''
    const dep60 = blocks[0].exercises.find((e) => e.distance === 50 && e.repetitions === 6);
    assert.ok(dep60, "Should find 6*50");
    assert.equal(dep60.rest, 60);
    assert.equal(dep60.restType, "departure");

    // 12*100 spé V3 @ 1'45
    const block2 = blocks[1];
    assert.ok(block2.exercises[0].distance === 100);
    assert.equal(block2.exercises[0].intensity, "V3");
    assert.equal(block2.exercises[0].rest, 105);

    // x3 block
    const x3Block = blocks.find((b) => b.repetitions === 3);
    assert.ok(x3Block, "Should have x3 block");
  });

  test("Example 6: progressive intensity V1↗", () => {
    const text = `6*100 Cr tuba V1↗︎ @ 1'25 / 1'30`;

    const blocks = parseSwimText(text);
    assert.ok(blocks.length >= 1);
    const ex = blocks[0].exercises[0];
    assert.equal(ex.intensity, "Prog");
    assert.equal(ex.rest, 85); // 1'25
    assert.equal(ex.restType, "departure");
    assert.ok(ex.equipment.includes("tuba"));
  });

  test("Example 2: 4*100 with Form B sub-details", () => {
    const text = `4*100 r : 20''
#1 : NAC V0
#2 : spé V2`;

    const blocks = parseSwimText(text);
    assert.ok(blocks.length >= 1);
    const b = blocks[0];
    assert.equal(b.exercises.length, 1);
    assert.equal(b.exercises[0].repetitions, 4);
    assert.equal(b.exercises[0].distance, 100);
    assert.equal(b.exercises[0].rest, 20);
    // Form B sub-details should be in modalities
    assert.ok(b.exercises[0].modalities.includes("1 : NAC V0"));
    assert.ok(b.exercises[0].modalities.includes("2 : spé V2"));
  });

  test("equipment extraction: plaq, tuba, pull, palmes", () => {
    const text = `4*200 Cr plaq tuba pull r : 20''`;
    const blocks = parseSwimText(text);
    assert.ok(blocks.length >= 1);
    const ex = blocks[0].exercises[0];
    assert.ok(ex.equipment.includes("plaquettes"));
    assert.ok(ex.equipment.includes("tuba"));
    assert.ok(ex.equipment.includes("pull"));
  });

  test("continuation: + 200 EZ", () => {
    const text = `400 spé
+ 200 EZ`;
    const blocks = parseSwimText(text);
    assert.ok(blocks.length >= 1);
    const b = blocks[0];
    assert.equal(b.exercises.length, 2);
    assert.equal(b.exercises[0].distance, 400);
    assert.equal(b.exercises[1].distance, 200);
    assert.equal(b.exercises[1].intensity, "V0");
  });

  test("D2B not parsed as dos", () => {
    const text = `1*50 NC
#25 VAcc
#25 D2B`;
    const blocks = parseSwimText(text);
    // Parent 1*50 NC is kept, sub-details become modalities
    assert.equal(blocks[0].exercises.length, 1);
    assert.equal(blocks[0].exercises[0].distance, 50);
    assert.ok(blocks[0].exercises[0].modalities.includes("25 D2B"));
    // D2B should not make the parent stroke "dos"
    assert.notEqual(blocks[0].exercises[0].stroke, "dos");
  });

  test("slash-separated content in parens", () => {
    const text = `800 (100 Cr / 100 Cr-D pull)`;
    const blocks = parseSwimText(text);
    assert.ok(blocks.length >= 1);
    assert.equal(blocks[0].exercises[0].distance, 800);
    assert.ok(blocks[0].exercises[0].modalities.includes("100 Cr / 100 Cr-D pull"));
  });

  test("Fix 1 — 3x (...) extrait repetitions=3", () => {
    const text = `3x  (1x papillon 1x dos 1x crawl)`;
    const blocks = parseSwimText(text);
    const repBlock = blocks.find((b) => (b.repetitions ?? 1) === 3);
    assert.ok(repBlock, "Should find a block with repetitions=3");
  });

  test("Fix 1 — 8x 50 sans parens reste un exercise 8×50", () => {
    const text = `8x 50 d:55''`;
    const blocks = parseSwimText(text);
    assert.ok(blocks.length >= 1);
    const ex = blocks[0].exercises[0];
    assert.equal(ex.repetitions, 8);
    assert.equal(ex.distance, 50);
  });

  test("Fix 2 — ligne commençant par NNN'' = temps, distance=null", () => {
    const blocks = parseSwimText(`x6\n20'' jbes vertical @ 30''\n+ 50 EZ`);
    const b = blocks.find((b) => (b.repetitions ?? 1) === 6);
    assert.ok(b, "Block x6 should exist");
    const timedEx = b!.exercises.find((e) => e.distance === null || e.distance === 0);
    assert.ok(timedEx, "Timed exercise should have null/0 distance");
    const swimEx = b!.exercises.find((e) => e.distance === 50);
    assert.ok(swimEx, "50m EZ should be parsed");
  });
});

// ── detectTextWarnings ──

describe("detectTextWarnings", () => {
  test("no warnings on clean text", () => {
    const text = `300 Cr EZ\n8*50 jbes V1 @ 55''\n200 NAC`;
    assert.deepEqual(detectTextWarnings(text), []);
  });

  test("warns on time-notation line (20'' jbes vertical)", () => {
    const text = `x6\n20'' jbes vertical @ 30''\n+ 50 EZ`;
    const warnings = detectTextWarnings(text);
    assert.ok(warnings.length >= 1, "Should have at least 1 warning");
    assert.ok(warnings.some((w) => w.type === "time_as_distance"), "Should warn time_as_distance");
    assert.ok(warnings.some((w) => w.lineIndex === 1), "Warning should be on line index 1");
  });

  test("warns on split-distance pattern (1* 15 VMax / 10 EZ)", () => {
    const text = `1* 15 VMax hypoxie / 10 EZ`;
    const warnings = detectTextWarnings(text);
    assert.ok(warnings.some((w) => w.type === "split_distance"), "Should warn split_distance");
  });

  test("empty text returns no warnings", () => {
    assert.deepEqual(detectTextWarnings(""), []);
    assert.deepEqual(detectTextWarnings("   "), []);
  });
});
