import { test } from "node:test";
import assert from "node:assert/strict";
import { preserveMesocycleTag } from "../mesocycleItemPayload";

test("preserveMesocycleTag: garde mesocycle_id sur un item édité", () => {
  const prev = { mesocycle_id: "abc", periodization_cycle: "force_max" };
  const out = preserveMesocycleTag({ percent_1rm: 80 }, prev);
  assert.equal(out.mesocycle_id, "abc");
  assert.equal(out.percent_1rm, 80);
});

test("preserveMesocycleTag: propage mesocycle_id à un item ajouté dans une séance de mésocycle", () => {
  const out = preserveMesocycleTag({}, { mesocycle_id: "abc" });
  assert.equal(out.mesocycle_id, "abc");
});

test("preserveMesocycleTag: ne fabrique pas de tag hors mésocycle", () => {
  const out = preserveMesocycleTag({ foo: 1 }, {});
  assert.equal("mesocycle_id" in out, false);
});

test("preserveMesocycleTag: prev null/undefined → payload inchangé", () => {
  assert.equal("mesocycle_id" in preserveMesocycleTag({ a: 1 }, null), false);
  assert.equal(
    "mesocycle_id" in preserveMesocycleTag({ a: 1 }, undefined),
    false,
  );
});

test("preserveMesocycleTag: le tag prev écrase une valeur divergente du next", () => {
  // Un éditeur ne doit jamais ré-affecter un item à un autre mésocycle.
  const out = preserveMesocycleTag({ mesocycle_id: "WRONG" }, { mesocycle_id: "abc" });
  assert.equal(out.mesocycle_id, "abc");
});
