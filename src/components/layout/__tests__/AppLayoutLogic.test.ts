import assert from "node:assert/strict";
import { test } from "node:test";
import { getNavItemsForRole, getMobileNavItemsForRole } from "@/components/layout/navItems";

test("Coach nav items include expected labels", () => {
  const items = getNavItemsForRole("coach");
  const labels = items.map((item) => item.label);

  // §181 — Coach bottom nav initialement réduit à 5 items, Profil accessible
  // via header sticky (avatar UserCircle dans AppLayout coach header).
  // §271 — Ajout de "Ma muscu" pour ouvrir le module muscu perso aux coachs.
  assert.equal(items.length, 6);
  assert.equal(labels[0], "Home");
  assert.ok(labels.includes("Semaine"));
  assert.ok(labels.includes("Nageurs"));
  assert.ok(labels.includes("Biblio"));
  assert.ok(labels.includes("Chrono"));
  assert.ok(labels.includes("Ma muscu"));
  assert.ok(!labels.includes("Profil"));
});

test("Admin nav items match coach nav items", () => {
  const adminItems = getNavItemsForRole("admin");
  const coachItems = getNavItemsForRole("coach");
  const adminLabels = adminItems.map((item) => item.label);
  const coachLabels = coachItems.map((item) => item.label);

  assert.deepEqual(adminLabels, coachLabels);
});

test("getMobileNavItemsForRole — coach : Profil présent, Chrono absent", () => {
  const items = getMobileNavItemsForRole("coach");
  const labels = items.map((item) => item.label);
  assert.equal(items.length, 6);
  assert.ok(labels.includes("Profil"), "Profil doit être dans le dock mobile");
  assert.ok(!labels.includes("Chrono"), "Chrono ne doit PAS être dans le dock mobile");
  assert.ok(labels.includes("Ma muscu"));
});

test("getMobileNavItemsForRole — admin : même comportement que coach", () => {
  const coachItems = getMobileNavItemsForRole("coach");
  const adminItems = getMobileNavItemsForRole("admin");
  assert.deepEqual(
    adminItems.map((i) => i.label),
    coachItems.map((i) => i.label)
  );
});

test("getMobileNavItemsForRole — athlete : identique à getNavItemsForRole", () => {
  const mobile = getMobileNavItemsForRole("athlete");
  const desktop = getNavItemsForRole("athlete");
  assert.deepEqual(
    mobile.map((i) => i.label),
    desktop.map((i) => i.label)
  );
});

test("getNavItemsForRole coach — Chrono toujours présent (desktop inchangé)", () => {
  const items = getNavItemsForRole("coach");
  const labels = items.map((i) => i.label);
  assert.ok(labels.includes("Chrono"), "Chrono reste dans la nav desktop");
});
