import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeRunLogs } from "../mergeRunLogs";

test("ajoute des séries nouvelles en conservant l'ordre", () => {
  const out = mergeRunLogs(
    [{ exercise_id: 1, set_number: 1, reps: 5 }],
    [{ exercise_id: 1, set_number: 2, reps: 5 }],
  );
  assert.deepEqual(out.map((l) => l.set_number), [1, 2]);
});

test("« Réessayer » renvoie la même série → pas de doublon, la valeur la plus récente gagne", () => {
  const out = mergeRunLogs(
    [{ exercise_id: 1, set_number: 1, reps: 5, weight: 40 }, { exercise_id: 1, set_number: 2, reps: 5, weight: 40 }],
    [{ exercise_id: 1, set_number: 2, reps: 6, weight: 42 }],
  );
  assert.equal(out.length, 2);
  assert.deepEqual(out[1], { exercise_id: 1, set_number: 2, reps: 6, weight: 42 });
});

test("identité = exercice + numéro (set_index / set_number / setIndex)", () => {
  const out = mergeRunLogs(
    [{ exercise_id: 1, set_index: 1 }, { exercise_id: 2, set_number: 1 }],
    [{ exercise_id: 1, setIndex: 1, reps: 9 }, { exercise_id: 3, set_number: 1 }],
  );
  assert.deepEqual(out.map((l) => l.exercise_id), [1, 2, 3]);
  assert.equal(out[0].reps, 9);
});

test("série sans numéro → simplement ajoutée (pas de fusion devinée)", () => {
  const out = mergeRunLogs([{ exercise_id: 1 }], [{ exercise_id: 1 }]);
  assert.equal(out.length, 2);
});

test("prev null → liste des nouvelles séries", () => {
  assert.deepEqual(mergeRunLogs(null, [{ exercise_id: 1, set_number: 1 }]), [{ exercise_id: 1, set_number: 1 }]);
});

test("ne mute pas le tableau d'origine", () => {
  const prev = [{ exercise_id: 1, set_number: 1, reps: 5 }];
  mergeRunLogs(prev, [{ exercise_id: 1, set_number: 1, reps: 8 }]);
  assert.equal(prev[0].reps, 5);
});
