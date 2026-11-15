// §394 (audit muscu 2ᵉ passe, R3/O1) — un exercice utilisé ne se supprime plus
// (la suppression effaçait en cascade séries et 1RM de tous les nageurs) : il
// s'archive. Une séance se supprime toujours, mais en annonçant ce qu'elle vide.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isExerciseInUse,
  exerciseUsageText,
  selectableExercises,
  sessionUsageText,
} from "../exerciseArchive";
import { normalizeExercise } from "../../api/helpers";

const NONE = { sessions: 0, setLogs: 0, oneRms: 0, warmups: 0 };

test("isExerciseInUse : faux seulement si aucun usage", () => {
  assert.equal(isExerciseInUse(NONE), false);
  assert.equal(isExerciseInUse({ ...NONE, setLogs: 1 }), true);
  assert.equal(isExerciseInUse({ ...NONE, warmups: 1 }), true);
});

test("exerciseUsageText : accords et énumération en français", () => {
  assert.equal(
    exerciseUsageText({ sessions: 3, setLogs: 120, oneRms: 4, warmups: 1 }),
    "3 séances, 120 séries enregistrées, 4 1RM et une routine d'échauffement",
  );
  assert.equal(exerciseUsageText({ ...NONE, sessions: 1 }), "1 séance");
  assert.equal(
    exerciseUsageText({ ...NONE, setLogs: 1, oneRms: 1 }),
    "1 série enregistrée et 1 1RM",
  );
  assert.equal(exerciseUsageText({ ...NONE, warmups: 2 }), "2 routines d'échauffement");
  assert.equal(exerciseUsageText(NONE), "");
});

test("selectableExercises : masque les archivés, garde celui déjà choisi", () => {
  const list = [
    { id: 1, archived_at: null },
    { id: 2, archived_at: "2026-11-15T10:00:00Z" },
    { id: 3 },
  ];
  assert.deepEqual(selectableExercises(list).map((e) => e.id), [1, 3]);
  assert.deepEqual(selectableExercises(list, 2).map((e) => e.id), [1, 2, 3]);
});

test("sessionUsageText : rien à signaler → chaîne vide", () => {
  assert.equal(sessionUsageText({ planningSlots: 0, planSessions: 0 }), "");
  assert.equal(
    sessionUsageText({ planningSlots: 5, planSessions: 1 }),
    "5 créneaux de planification et 1 plan d'entraînement",
  );
  assert.equal(sessionUsageText({ planningSlots: 1, planSessions: 0 }), "1 créneau de planification");
});

test("normalizeExercise conserve archived_at (sinon un archivé réapparaît)", () => {
  const ex = normalizeExercise({ id: 9, nom_exercice: "X", archived_at: "2026-11-15T10:00:00Z" });
  assert.equal(ex.archived_at, "2026-11-15T10:00:00Z");
  assert.equal(normalizeExercise({ id: 9, nom_exercice: "X" }).archived_at, null);
});
