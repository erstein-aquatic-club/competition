import assert from "node:assert/strict";
import { test } from "node:test";

import { summarizeLoadFailures, type LoadableQuery } from "./queryLoadFailures";

function q(partial: Partial<LoadableQuery> = {}): LoadableQuery & { calls: number } {
  const state = {
    isLoadingError: false,
    isFetching: false,
    calls: 0,
    refetch: () => {
      state.calls += 1;
      return Promise.resolve();
    },
    ...partial,
  };
  return state;
}

test("aucune requête en échec → hasFailure false, liste vide", () => {
  const s = summarizeLoadFailures([["bilan", q()], ["KPI", q()]]);
  assert.equal(s.hasFailure, false);
  assert.deepEqual(s.failedLabels, []);
  assert.equal(s.isRetrying, false);
});

test("liste les libellés des requêtes en échec au premier chargement", () => {
  const s = summarizeLoadFailures([
    ["bilan", q({ isLoadingError: true })],
    ["KPI", q()],
    ["échauffements", q({ isLoadingError: true })],
  ]);
  assert.equal(s.hasFailure, true);
  assert.deepEqual(s.failedLabels, ["bilan", "échauffements"]);
});

test("retry ne relance QUE les requêtes en échec", () => {
  const ok = q();
  const ko = q({ isLoadingError: true });
  summarizeLoadFailures([["a", ok], ["b", ko]]).retry();
  assert.equal(ok.calls, 0);
  assert.equal(ko.calls, 1);
});

test("isRetrying vrai si une requête en échec est en cours de relance", () => {
  const s = summarizeLoadFailures([
    ["a", q({ isLoadingError: true, isFetching: true })],
    ["b", q({ isFetching: true })],
  ]);
  assert.equal(s.isRetrying, true);
});

test("isRetrying ignore le fetch d'une requête saine", () => {
  const s = summarizeLoadFailures([
    ["a", q({ isLoadingError: true })],
    ["b", q({ isFetching: true })],
  ]);
  assert.equal(s.isRetrying, false);
});

test("formatFailedLabels joint proprement en français", () => {
  assert.equal(summarizeLoadFailures([["bilan", q({ isLoadingError: true })]]).failedText, "bilan");
  assert.equal(
    summarizeLoadFailures([
      ["bilan", q({ isLoadingError: true })],
      ["KPI", q({ isLoadingError: true })],
    ]).failedText,
    "bilan et KPI",
  );
  assert.equal(
    summarizeLoadFailures([
      ["bilan", q({ isLoadingError: true })],
      ["KPI", q({ isLoadingError: true })],
      ["profil", q({ isLoadingError: true })],
    ]).failedText,
    "bilan, KPI et profil",
  );
});
