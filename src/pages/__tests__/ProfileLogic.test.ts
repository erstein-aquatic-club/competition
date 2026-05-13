import assert from "node:assert/strict";
import { test } from "node:test";
import { getRoleLabel, shouldShowRecords } from "@/pages/Profile";

test("getRoleLabel returns readable labels per role", () => {
  assert.equal(getRoleLabel("coach"), "Entraineur EAC");
  assert.equal(getRoleLabel("admin"), "Admin");
  assert.equal(getRoleLabel("comite"), "Comité");
  assert.equal(getRoleLabel("athlete"), "Nageur");
  assert.equal(getRoleLabel(null), "Nageur");
});

test("shouldShowRecords hides records for comite, ouvre coach/admin (§273)", () => {
  // §273 — coach/admin accèdent à /records pour le tab muscu (1RM).
  // Le tab natation reste vide (pas de FFN IUF) mais ne bloque pas.
  assert.equal(shouldShowRecords("coach"), true);
  assert.equal(shouldShowRecords("admin"), true);
  assert.equal(shouldShowRecords("comite"), false);
  assert.equal(shouldShowRecords("athlete"), true);
  assert.equal(shouldShowRecords(null), true);
});
