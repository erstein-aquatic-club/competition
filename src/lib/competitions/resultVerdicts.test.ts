import { test } from "node:test";
import assert from "node:assert/strict";
import { collapseByEvent, eventVerdict } from "./resultVerdicts.ts";
import type { ResultsSnapshotRace } from "../api/types.ts";

const race = (p: Partial<ResultsSnapshotRace>): ResultsSnapshotRace => ({
  rawEvent: "", eventCode: "50NL", phase: "series", place: null,
  timeSeconds: null, timeDisplay: "", points: null, splits: [], ...p,
});

test("collapseByEvent : finale prioritaire + meilleur temps", () => {
  const g = collapseByEvent([
    race({ phase: "series", place: 3, timeSeconds: 24.10 }),
    race({ phase: "finaleA", place: 1, timeSeconds: 23.94 }),
  ]);
  assert.equal(g.length, 1);
  assert.equal(g[0].finalPlace, 1);
  assert.equal(g[0].bestTime, 23.94);
  assert.equal(g[0].qualifiedFinal, "A");
});

test("collapseByEvent : séries seules → pas de finale", () => {
  const g = collapseByEvent([race({ phase: "series", place: 7, timeSeconds: 23.94 })]);
  assert.equal(g[0].finalPlace, 7);
  assert.equal(g[0].qualifiedFinal, null);
});

const perfs = (arr: Array<[number, string]>) =>
  arr.map(([t, d]) => ({ event_code: "50NL", pool_length: 50, time_seconds: t, competition_date: d }));

test("verdict : nouveau record perso", () => {
  const v = eventVerdict({
    eventCode: "50NL", poolLength: 50, time: 23.94, place: 1, compDate: "2026-05-24",
    perfs: perfs([[24.20, "2025-12-01"], [24.05, "2026-03-01"]]), objectives: [],
  });
  assert.equal(v.isNewBest, true);
  assert.ok(Math.abs(v.bestDelta! - (-0.11)) < 1e-6);
  assert.equal(v.objective, null);
  assert.equal(v.historyRank, 1);
});

test("verdict : objectif atteint (prioritaire sur rang historique)", () => {
  const v = eventVerdict({
    eventCode: "50NL", poolLength: 50, time: 23.94, place: 1, compDate: "2026-05-24",
    perfs: perfs([[24.20, "2025-12-01"]]),
    objectives: [{ event_code: "50NL", target_time_seconds: 24.00 }],
  });
  assert.equal(v.objective!.met, true);
  assert.ok(Math.abs(v.objective!.gap - (-0.06)) < 1e-6);
  assert.equal(v.historyRank, null);
});

test("verdict : objectif manqué", () => {
  const v = eventVerdict({
    eventCode: "50NL", poolLength: 50, time: 24.40, place: 5, compDate: "2026-05-24",
    perfs: [], objectives: [{ event_code: "50NL", target_time_seconds: 24.00 }],
  });
  assert.equal(v.objective!.met, false);
  assert.ok(Math.abs(v.objective!.gap - 0.40) < 1e-6);
});

test("verdict : rang historique en fallback (pas d'objectif)", () => {
  const v = eventVerdict({
    eventCode: "50NL", poolLength: 50, time: 24.10, place: 4, compDate: "2026-05-24",
    perfs: perfs([[23.94, "2025-12-01"], [24.05, "2026-03-01"], [24.30, "2025-10-01"]]),
    objectives: [],
  });
  assert.equal(v.isNewBest, false);
  assert.equal(v.historyRank, 3);
});

test("verdict : première perf sur l'épreuve (aucun historique)", () => {
  const v = eventVerdict({
    eventCode: "50NL", poolLength: 50, time: 24.10, place: 4, compDate: "2026-05-24",
    perfs: [], objectives: [],
  });
  assert.equal(v.isFirstEver, true);
  assert.equal(v.isNewBest, false);
  assert.equal(v.historyRank, 1);
});

test("verdict : filtrage bassin (un 25m plus rapide n'écrase pas un best 50m)", () => {
  const v = eventVerdict({
    eventCode: "50NL", poolLength: 50, time: 23.94, place: 1, compDate: "2026-05-24",
    perfs: [{ event_code: "50NL", pool_length: 25, time_seconds: 23.50, competition_date: "2025-12-01" }],
    objectives: [],
  });
  assert.equal(v.isNewBest, true);
  assert.equal(v.isFirstEver, true);
});

test("verdict : exclut la perf de CE meet déjà synchronisée (compDate)", () => {
  const v = eventVerdict({
    eventCode: "50NL", poolLength: 50, time: 23.94, place: 1, compDate: "2026-05-24",
    perfs: perfs([[23.94, "2026-05-24"], [24.20, "2025-12-01"]]),
    objectives: [],
  });
  assert.equal(v.isNewBest, true);
});

test("verdict : tolère les event_code au format FFN (\"50 NL\")", () => {
  const v = eventVerdict({
    eventCode: "50NL", poolLength: 50, time: 23.94, place: 1, compDate: "2026-05-24",
    perfs: [{ event_code: "50 NL", pool_length: 50, time_seconds: 24.20, competition_date: "2025-12-01" }],
    objectives: [],
  });
  assert.equal(v.isNewBest, true);
  assert.equal(v.isFirstEver, false);
  assert.equal(v.historyRank, 1);
});
