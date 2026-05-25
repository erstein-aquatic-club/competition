import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getMondayOfWeek,
  materializeSlots,
  computeSlotState,
  getSlotScheduleBucket,
  resolveSlotAssignment,
  sumAssignedDistance,
} from "../useSlotCalendar";
import type { SlotAssignment, SlotInstance, SlotState } from "../useSlotCalendar";
import type { TrainingSlot } from "@/lib/api/types";

describe("getMondayOfWeek", () => {
  it("returns the Monday for offset 0 (current week)", () => {
    const monday = getMondayOfWeek(0);
    assert.equal(new Date(monday).getDay(), 1); // 1 = Monday
  });
  it("returns next Monday for offset +1", () => {
    const thisMonday = getMondayOfWeek(0);
    const nextMonday = getMondayOfWeek(1);
    const diff = (new Date(nextMonday).getTime() - new Date(thisMonday).getTime()) / 86_400_000;
    assert.equal(diff, 7);
  });
  it("returns previous Monday for offset -1", () => {
    const thisMonday = getMondayOfWeek(0);
    const prevMonday = getMondayOfWeek(-1);
    const diff = (new Date(thisMonday).getTime() - new Date(prevMonday).getTime()) / 86_400_000;
    assert.equal(diff, 7);
  });
});

describe("materializeSlots", () => {
  const slot = {
    id: "slot-1",
    day_of_week: 1, // Monday (1-indexed)
    start_time: "08:00",
    end_time: "09:30",
    location: "Piscine A",
    is_active: true,
    created_by: null,
    created_at: "",
    assignments: [
      { id: "a1", slot_id: "slot-1", group_id: 1, group_name: "Avenirs", coach_id: 10, coach_name: "Coach A", lane_count: null },
    ],
  };

  it("generates one instance per matching day in the week", () => {
    const instances = materializeSlots([slot], [], [], "2026-03-02");
    assert.equal((instances).length, 1);
    assert.equal(instances[0].date, "2026-03-02");
    assert.equal(instances[0].state, "empty");
  });

  it("marks instance as cancelled when override exists", () => {
    const overrides = [{ id: "o1", slot_id: "slot-1", override_date: "2026-03-02", status: "cancelled" as const, new_start_time: null, new_end_time: null, new_location: null, reason: null, created_by: null, created_at: "" }];
    const instances = materializeSlots([slot], [], overrides, "2026-03-02");
    assert.equal(instances[0].state, "cancelled");
  });

  it("falls back to the morning assignment for the same date when no slot link exists", () => {
    // visible_from est volontairement loin dans le futur : materializeSlots compare
    // visible_from à toISODate(new Date()) (la date système réelle), donc une date
    // passée donnerait state="published". Le test cible l'état "draft" (assignation
    // non encore visible) → on garde visible_from dans le futur pour rester
    // indépendant de l'horloge. La résolution du fallback (id 11) dépend de
    // scheduled_date + bucket, pas de visible_from.
    const assignments = [
      {
        id: 11,
        swim_catalog_id: 4,
        training_slot_id: null,
        target_group_id: 1,
        scheduled_date: "2026-03-02",
        scheduled_slot: "morning",
        visible_from: "2999-01-01",
        notified_at: null,
        status: "assigned",
        session_name: "Matin",
        session_distance: null,
      },
    ];

    const instances = materializeSlots([slot], assignments, [], "2026-03-02");
    assert.equal(instances[0].assignment?.id, 11);
    assert.equal(instances[0].state, "draft");
  });
});

describe("getSlotScheduleBucket", () => {
  it("maps times before 12:00 to morning", () => {
    assert.equal(getSlotScheduleBucket("06:00"), "morning");
    assert.equal(getSlotScheduleBucket("11:59"), "morning");
  });

  it("maps times at or after 13:00 to evening", () => {
    assert.equal(getSlotScheduleBucket("13:00"), "evening");
    assert.equal(getSlotScheduleBucket("18:30"), "evening");
  });

  it("buckets noon (12:00–12:59) into morning — §95b removed the noon gap", () => {
    // L'implémentation initiale renvoyait null pour 12h00–12h59 (« noon gap »).
    // §95b (commit bd533c230, « harden session assignment flow ») a délibérément
    // supprimé ce trou : un créneau de midi tombait dans un bucket null et ne
    // matchait alors jamais d'assignation fallback. Le seuil est désormais
    // hour < 13 → morning, sinon evening.
    assert.equal(getSlotScheduleBucket("12:00"), "morning");
    assert.equal(getSlotScheduleBucket("12:45"), "morning");
  });

  it("returns null only for an unparseable start time", () => {
    assert.equal(getSlotScheduleBucket(""), null);
    assert.equal(getSlotScheduleBucket("not-a-time"), null);
  });
});

describe("resolveSlotAssignment", () => {
  const slot = {
    id: "slot-2",
    day_of_week: 2,
    start_time: "07:30",
    end_time: "09:00",
    location: "Piscine B",
    is_active: true,
    created_by: null,
    created_at: "",
    assignments: [
      { id: "a2", slot_id: "slot-2", group_id: 7, group_name: "Benjamins", coach_id: 3, coach_name: "Coach B", lane_count: null },
    ],
  };

  it("prefers a direct slot link", () => {
    const assignment = resolveSlotAssignment(slot, "2026-03-03", [
      {
        id: 1,
        swim_catalog_id: 9,
        training_slot_id: "slot-2",
        target_group_id: 7,
        scheduled_date: "2026-03-03",
        scheduled_slot: "morning",
        visible_from: null,
        notified_at: null,
        status: "assigned",
        session_name: "Direct",
        session_distance: null,
      },
      {
        id: 2,
        swim_catalog_id: 10,
        training_slot_id: null,
        target_group_id: 7,
        scheduled_date: "2026-03-03",
        scheduled_slot: "morning",
        visible_from: null,
        notified_at: null,
        status: "assigned",
        session_name: "Fallback",
        session_distance: null,
      },
    ]);

    assert.equal(assignment?.id, 1);
  });

  it("matches a fallback by date + bucket + group", () => {
    const assignment = resolveSlotAssignment(slot, "2026-03-03", [
      {
        id: 3,
        swim_catalog_id: 11,
        training_slot_id: null,
        target_group_id: 7,
        scheduled_date: "2026-03-03",
        scheduled_slot: "morning",
        visible_from: null,
        notified_at: null,
        status: "assigned",
        session_name: "Fallback group",
        session_distance: null,
      },
    ]);

    assert.equal(assignment?.id, 3);
  });
});

describe("computeSlotState", () => {
  const today = "2026-03-01";

  it("returns 'empty' when no assignment", () => {
    assert.equal(computeSlotState(undefined, today), "empty");
  });
  it("returns 'published' when visible_from is null", () => {
    assert.equal(computeSlotState({ visible_from: null } as any, today), "published");
  });
  it("returns 'published' when visible_from <= today", () => {
    assert.equal(computeSlotState({ visible_from: "2026-02-28" } as any, today), "published");
    assert.equal(computeSlotState({ visible_from: "2026-03-01" } as any, today), "published");
  });
  it("returns 'draft' when visible_from > today", () => {
    assert.equal(computeSlotState({ visible_from: "2026-03-05" } as any, today), "draft");
  });
});

describe("sumAssignedDistance", () => {
  const baseSlot: TrainingSlot = {
    id: "slot-x",
    day_of_week: 1,
    start_time: "08:00",
    end_time: "09:30",
    location: "Piscine A",
    is_active: true,
    created_by: null,
    created_at: "",
    assignments: [],
  };

  function mkInstance(
    state: SlotState,
    distance: number | null | undefined,
  ): SlotInstance {
    const assignment: SlotAssignment | undefined =
      distance === undefined
        ? undefined
        : {
            id: 0,
            swim_catalog_id: null,
            training_slot_id: baseSlot.id,
            target_group_id: null,
            scheduled_date: "2026-03-02",
            scheduled_slot: null,
            visible_from: null,
            notified_at: null,
            status: "assigned",
            session_name: null,
            session_distance: distance,
          };
    return {
      date: "2026-03-02",
      slot: baseSlot,
      groups: [],
      state,
      assignment,
    };
  }

  it("sums distances across published and draft instances", () => {
    const instances = [
      mkInstance("published", 3000),
      mkInstance("draft", 2500),
    ];
    assert.equal(sumAssignedDistance(instances), 5500);
  });

  it("excludes empty instances with no assignment", () => {
    const instances = [
      mkInstance("published", 2000),
      mkInstance("empty", undefined),
    ];
    assert.equal(sumAssignedDistance(instances), 2000);
  });

  it("excludes cancelled instances even when an assignment is attached", () => {
    const instances = [
      mkInstance("published", 1500),
      mkInstance("cancelled", 4000),
    ];
    assert.equal(sumAssignedDistance(instances), 1500);
  });

  it("treats null/undefined session_distance as 0", () => {
    const instances = [
      mkInstance("published", null),
      mkInstance("draft", 1000),
    ];
    assert.equal(sumAssignedDistance(instances), 1000);
  });

  it("returns 0 for empty input", () => {
    assert.equal(sumAssignedDistance([]), 0);
  });
});
