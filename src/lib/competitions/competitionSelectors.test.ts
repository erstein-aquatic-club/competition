import { test } from "node:test";
import assert from "node:assert/strict";
import { nextCompetition } from "./competitionSelectors.ts";

const C = (id: string, date: string, end_date?: string) => ({ id, name: id, date, end_date: end_date ?? null });

test("returns the soonest competition whose end date is today or later", () => {
  const comps = [C("past", "2026-05-01"), C("next", "2026-06-10"), C("later", "2026-07-01")];
  assert.equal(nextCompetition(comps, "2026-06-01")?.id, "next");
});
test("an ongoing multi-day competition (started, not finished) is 'next'", () => {
  const comps = [C("ongoing", "2026-05-30", "2026-06-02"), C("later", "2026-07-01")];
  assert.equal(nextCompetition(comps, "2026-06-01")?.id, "ongoing");
});
test("returns null when all competitions are fully past", () => {
  assert.equal(nextCompetition([C("a", "2026-01-01"), C("b", "2026-02-01")], "2026-06-01"), null);
});
test("returns null on empty input", () => {
  assert.equal(nextCompetition([], "2026-06-01"), null);
});
