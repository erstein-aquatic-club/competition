import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { parseHtmlFull } from "../../supabase/functions/_shared/ffn-parser";

const fixture = fs.readFileSync(
  path.resolve("src/__tests__/fixtures/ffn-prf-sample.html"),
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
