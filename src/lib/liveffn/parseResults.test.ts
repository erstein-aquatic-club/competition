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
  // M3: timeDisplay normalisé comme parseStartlist (formatTimeDisplay) → "23.94", pas "00:23.94".
  assert.equal(free50.timeDisplay, "23.94");
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

// M4: finale simple (un seul final, petits meetings) — "Finale" sans lettre.
test("classifyPhase: finale simple → finaleA + base sans 'Finale'", () => {
  const r = classifyPhase("50 Nage Libre Messieurs Finale");
  assert.equal(r.phase, "finaleA");
  assert.equal(r.base, "50 Nage Libre");
});

// I1: une ligne survol SANS cellule 'rem' ne doit pas avaler la ligne suivante.
test("parseResults I1: ligne sans cellule rem n'avale pas la suivante", () => {
  const synthetic = `
    <tr><td colspan="7" class="resStructureIndividu1">TEST Alpha (2000) FRA </td></tr>
    <tr class="survol">
      <td class="resStructureDetailPlace">1er</td>
      <td><a class="underline">50 Nage Libre Messieurs Finale</a></td>
      <td class="resStructureRelayeur"></td>
      <td class="temps_sans_tps_passage">00:24.10</td>
      <td class="points">1100 pts</td>
    </tr>
    <tr class="survol">
      <td class="resStructureDetailPlace">2e</td>
      <td><a class="underline">100 Nage Libre Messieurs Séries</a></td>
      <td class="resStructureRelayeur"></td>
      <td class="temps_sans_tps_passage">00:52.50</td>
      <td class="reaction"></td>
      <td class="points">1080 pts</td>
      <td class="rem"></td>
    </tr>`;
  const r = parseResults(synthetic);
  assert.equal(r.swimmers.length, 1);
  const races = r.swimmers[0].races;
  assert.equal(races.length, 2, "les deux lignes doivent être captées");
  assert.equal(races[0].rawEvent, "50 Nage Libre Messieurs Finale");
  assert.equal(races[0].phase, "finaleA");
  assert.equal(races[0].timeSeconds, 24.1);
  assert.equal(races[0].points, 1100);
  assert.equal(races[1].rawEvent, "100 Nage Libre Messieurs Séries");
  assert.equal(races[1].timeSeconds, 52.5);
});

// I2: cellule temps non-temporelle contenant un chiffre → pas de faux timeSeconds.
test("parseResults I2: statut non-temps avec chiffre → timeSeconds null", () => {
  const synthetic = `
    <tr><td colspan="7" class="resStructureIndividu1">TEST Beta (2001) FRA </td></tr>
    <tr class="survol">
      <td class="resStructureDetailPlace"></td>
      <td><a class="underline">50 Nage Libre Messieurs Séries</a></td>
      <td class="resStructureRelayeur"></td>
      <td class="temps_sans_tps_passage">Repêchage 2</td>
      <td class="reaction"></td>
      <td class="points"></td>
      <td class="rem"></td>
    </tr>`;
  const r = parseResults(synthetic);
  const race = r.swimmers[0].races[0];
  assert.equal(race.timeSeconds, null);
  assert.equal(race.timeDisplay, "Repêchage 2");
});
