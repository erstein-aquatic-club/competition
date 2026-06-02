import { test } from "node:test";
import assert from "node:assert/strict";
import { currentSeasonStart, bestForEvent } from "./seasonBest.ts";

test("currentSeasonStart: Sept→Aug FFN season boundary", () => {
  assert.equal(currentSeasonStart("2026-06-01"), "2025-09-01");
  assert.equal(currentSeasonStart("2026-09-01"), "2026-09-01");
  assert.equal(currentSeasonStart("2026-10-15"), "2026-09-01");
  assert.equal(currentSeasonStart("2026-01-10"), "2025-09-01");
});

const P = (event_code: string, time: number, date: string) => ({ event_code, time_seconds: time, competition_date: date, pool_length: 50 });
const Pp = (event_code: string, time: number, date: string, pool: number) => ({ event_code, time_seconds: time, competition_date: date, pool_length: pool });

test("bestForEvent: all-time best for the event (lowest time) + date", () => {
  const perfs = [P("50 NL", 24.1, "2024-12-01"), P("50 NL", 23.6, "2025-11-01"), P("100 NL", 52.0, "2026-01-01")];
  assert.deepEqual(bestForEvent(perfs, "50NL"), { time: 23.6, date: "2025-11-01" });
});
test("bestForEvent with fromDate filters the window (season best)", () => {
  const perfs = [P("50 NL", 23.6, "2025-03-01"), P("50 NL", 24.0, "2025-11-01")];
  assert.deepEqual(bestForEvent(perfs, "50NL", { fromDate: "2025-09-01" }), { time: 24.0, date: "2025-11-01" });
});
test("bestForEvent returns null when no perf matches the event", () => {
  assert.equal(bestForEvent([P("100 Dos", 60, "2026-01-01")], "50NL"), null);
});
test("bestForEvent with poolLength filters by basin (a faster 25m time is ignored for a 50m pool)", () => {
  const perfs = [Pp("50 NL", 22.9, "2026-01-01", 25), Pp("50 NL", 24.0, "2025-11-01", 50)];
  // 50m basin → ignore the faster 25m time, return the 50m best
  assert.deepEqual(bestForEvent(perfs, "50NL", { poolLength: 50 }), { time: 24.0, date: "2025-11-01" });
  // no poolLength → absolute best across basins (the 25m time)
  assert.deepEqual(bestForEvent(perfs, "50NL"), { time: 22.9, date: "2026-01-01" });
  // a swimmer with only a 25m time, asked for 50m → null
  assert.equal(bestForEvent([Pp("50 NL", 22.9, "2026-01-01", 25)], "50NL", { poolLength: 50 }), null);
});
