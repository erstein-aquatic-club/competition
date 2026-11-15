import assert from "node:assert/strict";
import { test } from "node:test";

import { folderDeleteDescription } from "../ConfirmFolderDeleteDialog";

test("cycle vide → définitif, sans mention de séances", () => {
  assert.equal(folderDeleteDescription("cycle", 0), "Ce cycle est vide. Cette action est définitive.");
});

test("1 séance → accord au singulier", () => {
  assert.equal(
    folderDeleteDescription("cycle", 1),
    "La séance qu'il contient ne sera pas supprimée, mais elle sort de ce cycle. Cette action est définitive.",
  );
});

test("plusieurs séances → nombre + pluriel", () => {
  assert.equal(
    folderDeleteDescription("dossier", 4),
    "Les 4 séances qu'il contient ne seront pas supprimées, mais elles sortent de ce dossier. Cette action est définitive.",
  );
});

test("exercices → accord masculin", () => {
  assert.equal(
    folderDeleteDescription("dossier", 1, "exercice"),
    "L'exercice qu'il contient ne sera pas supprimé, mais il sort de ce dossier. Cette action est définitive.",
  );
  assert.equal(
    folderDeleteDescription("dossier", 3, "exercice"),
    "Les 3 exercices qu'il contient ne seront pas supprimés, mais ils sortent de ce dossier. Cette action est définitive.",
  );
});
