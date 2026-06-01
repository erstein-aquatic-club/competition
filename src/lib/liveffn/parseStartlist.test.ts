import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseStartlist } from "./parseStartlist.ts";

const html = readFileSync(
  fileURLToPath(new URL("./__fixtures__/startlist-93727-118.html", import.meta.url)),
  "utf8",
);

test("parses every swimmer from the structure startlist", () => {
  const { swimmers } = parseStartlist(html);
  const wagner = swimmers.find((s) => s.lastName === "WAGNER" && s.firstName === "Francois");
  assert.ok(wagner, "WAGNER Francois present");
  assert.equal(wagner!.birthYear, 1999);
  const free50 = wagner!.races.find((r) => /nage libre/i.test(r.rawEvent) && /^50/.test(r.rawEvent));
  assert.ok(free50);
  assert.equal(free50!.heat, 1);
  assert.equal(free50!.lane, 4);
  assert.equal(free50!.entryTimeDisplay, "23.64");
  assert.equal(free50!.entryTimeSeconds, 23.64);
  assert.equal(free50!.day, "Dimanche 24 Mai");
  assert.equal(free50!.time, "10h59");
});

test("does not invent swimmers and keeps races attached to the right heading", () => {
  const { swimmers } = parseStartlist(html);
  assert.ok(swimmers.length >= 3);
  for (const s of swimmers) assert.ok(s.races.length >= 1, `${s.lastName} has races`);
});

const row = (cells: { event?: string; serie?: string; couloir?: string; temps?: string; date?: string; horaire?: string }) => {
  const c: string[] = [];
  if (cells.event !== undefined) c.push(`<td>${cells.event}</td>`);
  c.push(`<td class="resStructureRelayeur"></td>`);
  if (cells.serie !== undefined) c.push(`<td class="startlist_serie">${cells.serie}</td>`);
  if (cells.couloir !== undefined) c.push(`<td class="startlist_couloir">${cells.couloir}</td>`);
  if (cells.temps !== undefined) c.push(`<td class="temps">${cells.temps}</td>`);
  if (cells.date !== undefined) c.push(`<td class="startlist_date">${cells.date}</td>`);
  if (cells.horaire !== undefined) c.push(`<td class="startlist_horaire">${cells.horaire}</td>`);
  return `<tr class="survol">${c.join("")}</tr>`;
};

test("splits compound (multi-word) last names correctly", () => {
  const inline =
    `<td colspan="7" class="resStructureIndividu1">LE GALL Marie-Hélène (2008) FRA </td>` +
    row({ event: "100 Dos Dames", serie: "série 2", couloir: "couloir 5", temps: "01:09.12", date: "Samedi 23 Mai", horaire: "11h00" }) +
    `<td colspan="7" class="resStructureIndividu1">VAN DEN BERG Lars (2005) NED </td>` +
    row({ event: "50 Nage Libre Messieurs", serie: "série 3", couloir: "couloir 1", temps: "00:24.10", date: "Dimanche 24 Mai", horaire: "10h00" });
  const { swimmers } = parseStartlist(inline);
  assert.equal(swimmers.length, 2);
  assert.equal(swimmers[0].lastName, "LE GALL");
  assert.equal(swimmers[0].firstName, "Marie-Hélène");
  assert.equal(swimmers[0].birthYear, 2008);
  assert.equal(swimmers[1].lastName, "VAN DEN BERG");
  assert.equal(swimmers[1].firstName, "Lars");
});

test("handles missing temps / couloir cells without throwing", () => {
  const inline =
    `<td colspan="7" class="resStructureIndividu1">DURAND Paul (2006) FRA </td>` +
    row({ event: "200 Brasse Messieurs", serie: "série 4", date: "Samedi 23 Mai", horaire: "16h23" });
  const { swimmers } = parseStartlist(inline);
  assert.equal(swimmers.length, 1);
  const race = swimmers[0].races[0];
  assert.ok(race);
  assert.equal(race.lane, null);
  assert.equal(race.entryTimeSeconds, null);
  assert.equal(race.entryTimeDisplay, "");
  assert.equal(race.heat, 4);
});

test("decodes &nbsp; and collapses whitespace in cells", () => {
  const inline =
    `<td colspan="7" class="resStructureIndividu1">MARTIN Léa (2009) FRA </td>` +
    row({ event: "50&nbsp;Papillon&nbsp;&nbsp;Dames", serie: "série&nbsp;1", couloir: "couloir 6", temps: "00:30.55", date: "Vendredi&nbsp;22&nbsp;Mai", horaire: "10h59" });
  const { swimmers } = parseStartlist(inline);
  const race = swimmers[0].races[0];
  assert.equal(race.rawEvent, "50 Papillon Dames");
  assert.equal(race.heat, 1);
  assert.equal(race.day, "Vendredi 22 Mai");
  assert.equal(race.entryTimeDisplay, "30.55");
});
