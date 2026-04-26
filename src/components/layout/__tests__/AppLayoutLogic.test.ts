import assert from "node:assert/strict";
import { test } from "node:test";
import { getNavItemsForRole } from "@/components/layout/navItems";

test("Coach nav items include expected labels", () => {
  const items = getNavItemsForRole("coach");
  const labels = items.map((item) => item.label);

  // §181 — Coach bottom nav réduit à 5 items, Profil accessible via header
  // sticky (avatar UserCircle dans AppLayout coach header).
  assert.equal(items.length, 5);
  assert.equal(labels[0], "Home");
  assert.ok(labels.includes("Semaine"));
  assert.ok(labels.includes("Nageurs"));
  assert.ok(labels.includes("Biblio"));
  assert.ok(labels.includes("Chrono"));
  assert.ok(!labels.includes("Profil"));
});

test("Admin nav items match coach nav items", () => {
  const adminItems = getNavItemsForRole("admin");
  const coachItems = getNavItemsForRole("coach");
  const adminLabels = adminItems.map((item) => item.label);
  const coachLabels = coachItems.map((item) => item.label);

  assert.deepEqual(adminLabels, coachLabels);
});
