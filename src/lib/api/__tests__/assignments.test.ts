import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { mock } from "node:test";

// These guards throw before any supabase.from() call, so the mock is minimal.
before(async () => {
  const real = await import("../client.ts");

  mock.module("../client.ts", {
    namedExports: {
      ...real,
      canUseSupabase: () => true,
      supabase: {
        from: () => {
          throw new Error("Unexpected supabase.from() call in guard tests");
        },
      },
    },
  });

  // Stub out side-effect modules that assignments.ts imports at the top level
  mock.module("../swim", { namedExports: { getSwimCatalog: async () => [] } });
  mock.module("../strength", { namedExports: { getStrengthSessions: async () => [] } });
  mock.module("../swimmer-slots", { namedExports: { getSwimmerSlots: async () => [] } });
  mock.module("../localStorage", {
    namedExports: {
      localStorageGet: () => null,
      localStorageSave: () => undefined,
    },
  });
});

describe("bulkCreateSlotAssignments — defensive guards", () => {
  it("rejects empty groupIds with explicit error", async () => {
    const { bulkCreateSlotAssignments } = await import("../assignments.ts");
    await assert.rejects(
      () =>
        bulkCreateSlotAssignments({
          swimCatalogId: 1,
          trainingSlotId: "slot-1",
          scheduledDate: "2026-04-30",
          groupIds: [],
          scheduledSlot: "morning",
          visibleFrom: null,
          assignedBy: 42,
        }),
      /Aucun groupe/,
    );
  });

  it("rejects visible_from > scheduled_date with friendly message", async () => {
    const { bulkCreateSlotAssignments } = await import("../assignments.ts");
    await assert.rejects(
      () =>
        bulkCreateSlotAssignments({
          swimCatalogId: 1,
          trainingSlotId: "slot-1",
          scheduledDate: "2026-04-30",
          groupIds: [42],
          scheduledSlot: "morning",
          visibleFrom: "2026-05-15",
          assignedBy: 42,
        }),
      /visibilité.*postérieure|postérieure.*créneau/,
    );
  });
});
