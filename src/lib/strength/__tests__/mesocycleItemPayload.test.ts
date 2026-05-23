import { test } from "node:test";
import assert from "node:assert/strict";
import {
  preserveMesocycleTag,
  reconcileMesocyclePayloads,
} from "../mesocycleItemPayload";

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

test("reconcileMesocyclePayloads: hors mésocycle → payloads d'origine inchangés", () => {
  const src = new Map<number, Record<string, unknown> | null>([
    [0, null],
    [1, null],
  ]);
  const out = reconcileMesocyclePayloads([0, 1], src);
  assert.deepEqual(out, [null, null]);
});

test("reconcileMesocyclePayloads: item édité de mésocycle garde son raw_payload complet", () => {
  const src = new Map<number, Record<string, unknown> | null>([
    [0, { mesocycle_id: "m1", periodization_cycle: "force_max", is_core: true }],
  ]);
  const out = reconcileMesocyclePayloads([0], src);
  assert.deepEqual(out[0], {
    mesocycle_id: "m1",
    periodization_cycle: "force_max",
    is_core: true,
  });
});

test("reconcileMesocyclePayloads: item AJOUTÉ (ordre absent) hérite du mesocycle_id de la séance", () => {
  const src = new Map<number, Record<string, unknown> | null>([
    [0, { mesocycle_id: "m1", periodization_cycle: "force_max" }],
  ]);
  // ordre 1 = item ajouté par le coach, absent de la source.
  const out = reconcileMesocyclePayloads([0, 1], src);
  assert.equal((out[1] as Record<string, unknown>).mesocycle_id, "m1");
});

test("reconcileMesocyclePayloads: corrélation par ordre (réordonnancement)", () => {
  const src = new Map<number, Record<string, unknown> | null>([
    [0, { mesocycle_id: "m1", tag: "a" }],
    [1, { mesocycle_id: "m1", tag: "b" }],
  ]);
  const out = reconcileMesocyclePayloads([1, 0], src);
  assert.equal((out[0] as Record<string, unknown>).tag, "b");
  assert.equal((out[1] as Record<string, unknown>).tag, "a");
});

test("reconcileMesocyclePayloads: aucun item null hors mésocycle ne devient {}", () => {
  // garde-fou : pas de fabrication de raw_payload pour une séance normale.
  const src = new Map<number, Record<string, unknown> | null>([[0, null]]);
  const out = reconcileMesocyclePayloads([0, 1], src);
  assert.equal(out[0], null);
  assert.equal(out[1], null);
});
