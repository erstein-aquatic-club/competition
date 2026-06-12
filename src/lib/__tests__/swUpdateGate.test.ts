import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldAnnounceSwUpdate } from "../swUpdateGate";

// §381 — gate anti-faux-positif de la bannière "Mise à jour disponible".
// Un SW en attente n'implique pas que l'app soit périmée : le fallback
// version.json (useVersionCheck) ou lazyWithRetry (§330) peuvent avoir déjà
// rechargé l'app à jour via le réseau sans activer le nouveau SW.

test("supprime la bannière quand le build serveur == build courant (app déjà à jour)", async () => {
  const result = await shouldAnnounceSwUpdate(
    "2026-06-12T10:00:00Z",
    async () => ({ build: "2026-06-12T10:00:00Z" }),
  );
  assert.equal(result, false);
});

test("annonce la mise à jour quand le build serveur diffère", async () => {
  const result = await shouldAnnounceSwUpdate(
    "2026-06-11T08:00:00Z",
    async () => ({ build: "2026-06-12T10:00:00Z" }),
  );
  assert.equal(result, true);
});

test("annonce (status quo) si version.json est illisible (null)", async () => {
  const result = await shouldAnnounceSwUpdate(
    "2026-06-12T10:00:00Z",
    async () => null,
  );
  assert.equal(result, true);
});

test("annonce (status quo) si le fetch rejette (offline)", async () => {
  const result = await shouldAnnounceSwUpdate("2026-06-12T10:00:00Z", async () => {
    throw new Error("network down");
  });
  assert.equal(result, true);
});

test("annonce (status quo) si la réponse n'a pas de champ build", async () => {
  const result = await shouldAnnounceSwUpdate(
    "2026-06-12T10:00:00Z",
    async () => ({}),
  );
  assert.equal(result, true);
});

test("annonce (status quo) si le build courant est inconnu", async () => {
  const result = await shouldAnnounceSwUpdate(undefined, async () => ({
    build: "2026-06-12T10:00:00Z",
  }));
  assert.equal(result, true);
});
