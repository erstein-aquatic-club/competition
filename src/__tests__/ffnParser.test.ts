import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { parseHtmlFull } from "../../supabase/functions/_shared/ffn-parser";

const fixture = fs.readFileSync(
  path.resolve("src/__tests__/fixtures/ffn-prf-sample.html"),
  "utf8",
);

const edgeFixture = fs.readFileSync(
  path.resolve("src/__tests__/fixtures/ffn-prf-edge-cases.html"),
  "utf8",
);

test("parseHtmlFull captures club_name from FFN performance row", () => {
  const rows = parseHtmlFull(fixture, 25);
  assert.ok(rows.length > 0, "expected at least one parsed row");
  const withClub = rows.filter((r) => r.club_name);
  assert.ok(
    withClub.length >= 1,
    `expected at least one row with club_name, got ${withClub.length}`,
  );
  for (const r of withClub) {
    assert.equal(r.club_name, "ERSTEIN AQUATIC CLUB");
  }
});

test("parseHtmlFull preserves competition_name and time_seconds (no regression)", () => {
  const rows = parseHtmlFull(fixture, 25);
  for (const r of rows) {
    assert.ok(r.time_seconds > 0, "time should parse");
    assert.notEqual(
      r.competition_name,
      "ERSTEIN AQUATIC CLUB",
      "competition_name must not be the club",
    );
  }
});

test("parseHtmlFull yields club_name === null when club cell is empty (does NOT fall through to location)", () => {
  const rows = parseHtmlFull(edgeFixture, 25);
  // Row 1 has empty club cell + location "STRASBOURG (FRA)" — club must be null,
  // NOT "STRASBOURG (FRA)" or any city-derived string.
  const strasbourgRow = rows.find((r) => r.time_seconds === 24.10);
  assert.ok(strasbourgRow, "expected to find the empty-club row");
  assert.equal(
    strasbourgRow!.club_name,
    null,
    `empty club cell must yield null, got ${JSON.stringify(strasbourgRow!.club_name)}`,
  );
});

test("parseHtmlFull captures heterogeneous club name (NATATION OBERNAI)", () => {
  const rows = parseHtmlFull(edgeFixture, 25);
  const obernaiRow = rows.find((r) => r.time_seconds === 24.50);
  assert.ok(obernaiRow, "expected to find the OBERNAI club row");
  assert.equal(obernaiRow!.club_name, "NATATION OBERNAI");
});

