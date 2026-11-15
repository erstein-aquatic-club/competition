import assert from "node:assert/strict";
import { test } from "node:test";

import { getMissingStrengthLogs } from "../reconcileStrengthLogs";

test("trou au milieu : séries 1 et 3 en base, la 2 manque → seule la 2 est renvoyée", () => {
  // Le cas que count/slice ratait : 2 lignes distantes ≥ … mais pas les bonnes.
  const local = [
    { exercise_id: 10, set_number: 1 },
    { exercise_id: 10, set_number: 2 },
    { exercise_id: 10, set_number: 3 },
  ];
  const missing = getMissingStrengthLogs(local, [
    { exercise_id: 10, set_index: 1 },
    { exercise_id: 10, set_index: 3 },
  ]);
  assert.deepEqual(missing.map((m) => m.setIndex), [2]);
  assert.equal(missing[0].log, local[1]);
});

test("identité = (exercice, série) : même numéro sur un autre exercice ne compte pas", () => {
  const missing = getMissingStrengthLogs(
    [{ exercise_id: 10, set_number: 1 }, { exercise_id: 11, set_number: 1 }],
    [{ exercise_id: 10, set_index: 1 }],
  );
  assert.deepEqual(missing.map((m) => [m.log.exercise_id, m.setIndex]), [[11, 1]]);
});

test("sans numéro de série : index séquentiel par exercice", () => {
  const missing = getMissingStrengthLogs(
    [{ exercise_id: 10 }, { exercise_id: 10 }, { exercise_id: 11 }],
    [],
  );
  assert.deepEqual(missing.map((m) => [m.log.exercise_id, m.setIndex]), [[10, 1], [10, 2], [11, 1]]);
});

test("doublon local ambigu → erreur plutôt qu'une synchro annoncée réussie", () => {
  assert.throws(
    () => getMissingStrengthLogs(
      [{ exercise_id: 10, set_number: 1 }, { exercise_id: 10, set_number: 1 }],
      [],
    ),
    /même identifiant/,
  );
});

test("ligne distante sans set_index → erreur (identité non fiable)", () => {
  assert.throws(
    () => getMissingStrengthLogs([{ exercise_id: 10, set_number: 1 }], [{ exercise_id: 10, set_index: null }]),
    /sans identifiant fiable/,
  );
});
