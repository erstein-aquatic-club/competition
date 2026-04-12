import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTodaySessionCompletionLookup, isTodaySessionLogged } from "@/pages/SwimmerHome";

test("buildTodaySessionCompletionLookup indexes assignment ids for today's sessions", () => {
  const lookup = buildTodaySessionCompletionLookup(
    [
      {
        id: 1,
        athlete_name: "Camille",
        date: "2026-04-12T08:00:00.000Z",
        slot: "Matin",
        effort: 3,
        feeling: 3,
        distance: 2500,
        duration: 90,
        comments: "",
        created_at: "2026-04-12T09:00:00.000Z",
        assignment_id: 42,
      },
    ],
    "2026-04-12",
  );

  assert.equal(lookup.assignmentIds.has(42), true);
  assert.equal(lookup.slotKeys.has("2026-04-12__AM"), true);
});

test("isTodaySessionLogged matches by assignment id before slot key fallback", () => {
  const lookup = buildTodaySessionCompletionLookup(
    [
      {
        id: 1,
        athlete_name: "Camille",
        date: "2026-04-12T08:00:00.000Z",
        slot: "Matin",
        effort: 3,
        feeling: 3,
        distance: 2500,
        duration: 90,
        comments: "",
        created_at: "2026-04-12T09:00:00.000Z",
        assignment_id: 42,
      },
    ],
    "2026-04-12",
  );

  assert.equal(
    isTodaySessionLogged({ assignmentId: 42, slotKey: "AM" }, lookup, "2026-04-12"),
    true,
  );
  assert.equal(
    isTodaySessionLogged({ assignmentId: 99, slotKey: "AM" }, lookup, "2026-04-12"),
    false,
  );
});

test("isTodaySessionLogged falls back to legacy slot matching when there is no assignment id", () => {
  const lookup = buildTodaySessionCompletionLookup(
    [
      {
        id: 1,
        athlete_name: "Camille",
        date: "2026-04-12T18:00:00.000Z",
        slot: "Soir",
        effort: 3,
        feeling: 3,
        distance: 3000,
        duration: 95,
        comments: "",
        created_at: "2026-04-12T19:00:00.000Z",
      },
    ],
    "2026-04-12",
  );

  assert.equal(
    isTodaySessionLogged({ slotKey: "PM" }, lookup, "2026-04-12"),
    true,
  );
});
