import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSwimLibraryContext } from "@/pages/coach/lib/swimLibraryContext";
import { makeSlotInstance } from "./fixtures/slots";

const makeInstance = () =>
  makeSlotInstance({
    date: "2026-04-22",
    slotOverrides: { id: "slot-42" },
  });

test("create mode builds a create context from the instance", () => {
  const ctx = buildSwimLibraryContext(makeInstance(), "create");
  assert.equal(ctx.mode, "create");
  assert.equal(ctx.slot.trainingSlotId, "slot-42");
  assert.equal(ctx.slot.scheduledDate, "2026-04-22");
  assert.equal(ctx.slot.startTime, "08:00:00");
  assert.equal(ctx.slot.endTime, "10:00:00");
  assert.equal(ctx.slot.location, "Piscine Erstein");
  assert.ok(!("swimCatalogId" in ctx));
});

test("edit mode with a swimCatalogId yields an edit context", () => {
  const ctx = buildSwimLibraryContext(makeInstance(), "edit", 123);
  assert.equal(ctx.mode, "edit");
  if (ctx.mode !== "edit") throw new Error("type narrowing failed");
  assert.equal(ctx.swimCatalogId, 123);
  assert.equal(ctx.slot.trainingSlotId, "slot-42");
});

test("edit mode without a swimCatalogId silently falls back to create", () => {
  const ctx = buildSwimLibraryContext(makeInstance(), "edit");
  assert.equal(ctx.mode, "create");
  assert.ok(!("swimCatalogId" in ctx));
});

test("edit mode with swimCatalogId === 0 still falls back (0 is a falsy id)", () => {
  // Preserves legacy behaviour (`swimCatalogId != null` allows 0, but the
  // upstream API never assigns a zero id — test documents the nullish guard).
  const ctx = buildSwimLibraryContext(makeInstance(), "edit", 0);
  assert.equal(ctx.mode, "edit");
  if (ctx.mode !== "edit") throw new Error("type narrowing failed");
  assert.equal(ctx.swimCatalogId, 0);
});
