import assert from "node:assert/strict";
import { test } from "node:test";

import { mutationErrorDescription } from "../mutationErrorToast";

test("mutationErrorDescription : message de l'erreur, sinon repli", () => {
  assert.equal(mutationErrorDescription(new Error("Dossier introuvable"), "repli"), "Dossier introuvable");
  assert.equal(mutationErrorDescription(new Error("  "), "repli"), "repli");
  assert.equal(mutationErrorDescription("boom", "repli"), "repli");
  assert.equal(mutationErrorDescription(null, "repli"), "repli");
});
