import { test } from "node:test";
import assert from "node:assert/strict";
import { startlistKey, normalizeName, autoMatch } from "./matchSwimmers.ts";

test("startlistKey is stable and order/accent/case independent", () => {
  assert.equal(startlistKey({ lastName: "WAGNER", firstName: "Francois", birthYear: 1999 }),
               "wagner-francois-1999");
});

test("normalizeName tokenizes order-independently (LASTNAME Firstname ↔ Firstname Lastname)", () => {
  assert.equal(normalizeName("WAGNER Francois"), normalizeName("François Wagner"));
});

test("autoMatch links by name; birth-year breaks ties only when both known", () => {
  const swimmers = [
    { lastName: "WAGNER", firstName: "Francois", birthYear: 1999 },
    { lastName: "NONNENMACHER", firstName: "Samuel", birthYear: 2004 },
  ];
  const athletes = [
    { id: 7, display_name: "François Wagner", birthYear: 1999 },
    { id: 9, display_name: "Samuel Nonnenmacher", birthYear: 2004 },
  ];
  const res = autoMatch(swimmers, athletes, {});
  assert.equal(res["wagner-francois-1999"], 7);
  assert.equal(res["nonnenmacher-samuel-2004"], 9);
});

test("explicit override wins over auto-match (incl. null = intentionally unmatched)", () => {
  const swimmers = [{ lastName: "WAGNER", firstName: "Francois", birthYear: 1999 }];
  const athletes = [{ id: 7, display_name: "François Wagner", birthYear: 1999 }];
  assert.equal(autoMatch(swimmers, athletes, { "wagner-francois-1999": null })["wagner-francois-1999"], null);
  assert.equal(autoMatch(swimmers, athletes, { "wagner-francois-1999": 42 })["wagner-francois-1999"], 42);
});

test("ambiguous (two same normalized names, no usable birth year) → null, not a wrong guess", () => {
  const swimmers = [{ lastName: "MARTIN", firstName: "Alex", birthYear: null }];
  const athletes = [
    { id: 1, display_name: "Alex Martin", birthYear: 2010 },
    { id: 2, display_name: "Martin Alex", birthYear: 2011 },
  ];
  assert.equal(autoMatch(swimmers, athletes, {})["martin-alex-null"], null);
});

test("accented athlete display_name matches accent-less startlist", () => {
  const swimmers = [{ lastName: "MULLER", firstName: "Helene", birthYear: 2005 }];
  const athletes = [{ id: 3, display_name: "Hélène Müller", birthYear: 2005 }];
  assert.equal(autoMatch(swimmers, athletes, {})["muller-helene-2005"], 3);
});

test("birth-year tiebreak: among two same-name athletes, only the year match is picked", () => {
  const swimmers = [{ lastName: "DURAND", firstName: "Paul", birthYear: 2008 }];
  const athletes = [
    { id: 4, display_name: "Paul Durand", birthYear: 2008 },
    { id: 5, display_name: "Paul Durand", birthYear: 2012 },
  ];
  assert.equal(autoMatch(swimmers, athletes, {})["durand-paul-2008"], 4);
});

test("name-only match degrades gracefully when athlete birthYear is absent", () => {
  const swimmers = [{ lastName: "WAGNER", firstName: "Francois", birthYear: 1999 }];
  const athletes = [{ id: 7, display_name: "François Wagner" }];
  assert.equal(autoMatch(swimmers, athletes, {})["wagner-francois-1999"], 7);
});
