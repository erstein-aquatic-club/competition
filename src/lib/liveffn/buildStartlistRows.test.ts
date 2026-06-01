import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStartlistRows, stripGender, bySwimmer, chronological } from "./buildStartlistRows.ts";

test("stripGender removes Messieurs/Dames/Mixte suffix", () => {
  assert.equal(stripGender("50 Nage Libre Messieurs"), "50 Nage Libre");
  assert.equal(stripGender("100 Brasse Dames"), "100 Brasse");
  assert.equal(stripGender("200 4 Nages Mixte"), "200 4 Nages");
});

test("enriches a matched race with best perf + objective target", () => {
  const swimmers = [{
    lastName: "WAGNER", firstName: "Francois", birthYear: 1999,
    races: [{ rawEvent: "50 Nage Libre Messieurs", heat: 1, lane: 4,
      entryTimeSeconds: 23.64, entryTimeDisplay: "23.64", day: "Dimanche 24 Mai", time: "10h59" }],
  }];
  const rows = buildStartlistRows({
    swimmers,
    matches: { "wagner-francois-1999": 7 },
    athleteName: { 7: "François Wagner" },
    perfsByUser: { 7: [{ event_code: "50 NL", pool_length: 50, time_seconds: 23.9, competition_date: "2026-03-01" }] },
    objectivesByUser: { 7: [{ event_code: "50NL", target_time_seconds: 23.2 }] },
  });
  const r = rows.find((x) => /50/.test(x.rawEvent))!;
  assert.equal(r.linked, true);
  assert.equal(r.swimmerName, "François Wagner");
  assert.equal(r.eventCode, "50NL");
  assert.equal(r.bestPerf?.time, 23.9);
  assert.equal(r.bestPerf?.date, "2026-03-01");
  assert.equal(r.objectiveTarget, 23.2);
});

test("unmatched swimmer → linked=false, no perf/objective, never throws", () => {
  const rows = buildStartlistRows({
    swimmers: [{ lastName: "X", firstName: "Y", birthYear: null,
      races: [{ rawEvent: "50 Dos Messieurs", heat: 1, lane: 8, entryTimeSeconds: 27.55,
        entryTimeDisplay: "27.55", day: "Samedi 23 Mai", time: "17h10" }] }],
    matches: { "x-y-null": null }, athleteName: {}, perfsByUser: {}, objectivesByUser: {},
  });
  assert.equal(rows[0].linked, false);
  assert.equal(rows[0].bestPerf, null);
  assert.equal(rows[0].objectiveTarget, null);
  assert.equal(rows[0].swimmerName, "X Y");
});

test("chronological sorts by day then hour; bySwimmer puts linked groups first", () => {
  const swimmers = [
    { lastName: "B", firstName: "B", birthYear: null, races: [
      { rawEvent: "50 NL Messieurs", heat: 1, lane: 1, entryTimeSeconds: 25, entryTimeDisplay: "25.00", day: "Dimanche 24 Mai", time: "10h58" }]},
    { lastName: "A", firstName: "A", birthYear: null, races: [
      { rawEvent: "100 Brasse Messieurs", heat: 1, lane: 1, entryTimeSeconds: 67, entryTimeDisplay: "1:07.00", day: "Vendredi 22 Mai", time: "16h41" }]},
  ];
  const rows = buildStartlistRows({ swimmers, matches: { "a-a-null": 1 }, athleteName: { 1: "Alpha" }, perfsByUser: {}, objectivesByUser: {} });
  const chron = chronological(rows);
  assert.equal(chron[0].day, "Vendredi 22 Mai");  // 22 May before 24 May
  const groups = bySwimmer(rows);
  assert.equal(groups[0].linked, true);            // linked swimmer (A→Alpha) first
});

test("minutes parses Hhmm; lowest objective target chosen", () => {
  const swimmers = [{
    lastName: "WAGNER", firstName: "Francois", birthYear: 1999,
    races: [{ rawEvent: "100 Nage Libre Messieurs", heat: 2, lane: 5,
      entryTimeSeconds: 52, entryTimeDisplay: "52.00", day: "Dimanche 24 Mai", time: "16h41" }],
  }];
  const rows = buildStartlistRows({
    swimmers,
    matches: { "wagner-francois-1999": 7 },
    athleteName: { 7: "François Wagner" },
    perfsByUser: {},
    objectivesByUser: { 7: [
      { event_code: "100NL", target_time_seconds: 51.5 },
      { event_code: "100NL", target_time_seconds: 50.9 },
    ] },
  });
  assert.equal(rows[0].minutes, 16 * 60 + 41); // 1001
  assert.equal(rows[0].objectiveTarget, 50.9);
});

test("unknown event → eventCode null, eventLabel falls back to stripped name", () => {
  const swimmers = [{
    lastName: "Z", firstName: "Z", birthYear: null,
    races: [{ rawEvent: "Relais 4x50 Messieurs", heat: 1, lane: 1,
      entryTimeSeconds: null, entryTimeDisplay: "", day: "Samedi 23 Mai", time: "09h00" }],
  }];
  const rows = buildStartlistRows({ swimmers, matches: { "z-z-null": 1 },
    athleteName: { 1: "Zed" }, perfsByUser: {}, objectivesByUser: {} });
  assert.equal(rows[0].eventCode, null);
  assert.equal(rows[0].eventLabel, "Relais 4x50");
  assert.equal(rows[0].bestPerf, null);
  assert.equal(rows[0].objectiveTarget, null);
});
