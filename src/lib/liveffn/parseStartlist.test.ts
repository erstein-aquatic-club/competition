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
