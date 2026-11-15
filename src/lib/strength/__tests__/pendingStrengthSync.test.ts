import assert from "node:assert/strict";
import { test } from "node:test";

import { countPendingStrengthSessions } from "../pendingStrengthSync";

const item = (type: string, payload: Record<string, unknown>) => ({ type, payload });

test("file vide → 0", () => {
  assert.equal(countPendingStrengthSessions([]), 0);
});

test("une séance = un run_id, même avec plusieurs séries + la fin de séance", () => {
  assert.equal(
    countPendingStrengthSessions([
      item("strength-set-log", { run_id: 12 }),
      item("strength-set-log", { run_id: 12 }),
      item("strength-run-completed", { run_id: 12 }),
    ]),
    1,
  );
});

test("plusieurs séances distinctes (y compris type legacy updateRun)", () => {
  assert.equal(
    countPendingStrengthSessions([
      item("strength-run-completed", { run_id: -1700000000000 }),
      item("strength-set-log", { run_id: 12 }),
      item("updateRun", { run_id: 13 }),
    ]),
    3,
  );
});

test("ignore les mutations hors muscu", () => {
  assert.equal(
    countPendingStrengthSessions([
      item("swim-session-completed", { run_id: 1 }),
      item("strength-kpi-measurement", { athlete_id: 3 }),
    ]),
    0,
  );
});

test("un élément muscu sans run_id compte quand même (jamais masqué)", () => {
  assert.equal(
    countPendingStrengthSessions([
      item("strength-run-completed", {}),
      item("strength-run-completed", {}),
    ]),
    2,
  );
});
