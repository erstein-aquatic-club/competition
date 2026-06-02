import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { classifyPhase, parsePlace, parseResults } from "./parseResults.ts";

// Real value of eventCodeFromFfnName("50 Nage Libre"), verified at impl time.
const EXPECTED_50NL = "50NL";

test("classifyPhase: séries", () => {
  assert.deepEqual(classifyPhase("50 Nage Libre Messieurs Séries"),
    { phase: "series", base: "50 Nage Libre" });
});
test("classifyPhase: finale A/B/C", () => {
  assert.equal(classifyPhase("100 Papillon Dames Finale A").phase, "finaleA");
  assert.equal(classifyPhase("100 Papillon Dames Finale B").phase, "finaleB");
  assert.equal(classifyPhase("100 Papillon Dames Finale C").phase, "finaleC");
});
test("classifyPhase: pas de suffixe → unknown + base sans genre", () => {
  assert.deepEqual(classifyPhase("200 Brasse Messieurs"),
    { phase: "unknown", base: "200 Brasse" });
});
test("parsePlace", () => {
  assert.equal(parsePlace("7e"), 7);
  assert.equal(parsePlace("1er"), 1);
  assert.equal(parsePlace("1re"), 1);
  assert.equal(parsePlace(""), null);
  assert.equal(parsePlace("DSQ"), null);
});

const html = readFileSync(
  fileURLToPath(new URL("./__fixtures__/resultats-93727-118.html", import.meta.url)), "utf8");

test("parseResults: 3 nageurs avec courses", () => {
  const r = parseResults(html);
  assert.equal(r.swimmers.length, 3);
  const stellio = r.swimmers.find((s) => s.lastName === "HASAPIS");
  assert.ok(stellio);
  assert.equal(stellio.birthYear, 2007);
  const free50 = stellio.races.find((x) => x.rawEvent.startsWith("50 Nage Libre"));
  assert.ok(free50);
  assert.equal(free50.place, 7);
  assert.equal(free50.phase, "series");
  assert.equal(free50.eventCode, EXPECTED_50NL);
  assert.equal(free50.timeSeconds, 23.94);
  assert.equal(free50.points, 1177);
});

test("parseResults: capte les splits quand présents (class temps)", () => {
  const r = parseResults(html);
  const stellio = r.swimmers.find((s) => s.lastName === "HASAPIS");
  assert.ok(stellio);
  const free100 = stellio.races.find((x) => x.rawEvent.startsWith("100 Nage Libre"));
  assert.ok(free100);
  assert.equal(free100.timeSeconds, 52.09);
  assert.ok(free100.splits.length >= 2);
});

test("parseResults: athleteMap vide (rempli par l'UI)", () => {
  const r = parseResults(html);
  assert.deepEqual(r.athleteMap, {});
});
