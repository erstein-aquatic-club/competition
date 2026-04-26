/**
 * RLS: strength_planning_slots + strength_planning_slot_overrides +
 *      strength_planning_week_meta + strength_planning_week_overrides
 *
 * Intent:
 *   - Read: everyone authenticated sees everything (global SELECT).
 *   - Write: only coach/admin. Athletes CANNOT insert/update/delete.
 *   - Regression for §113: DELETE by athlete must be a no-op (0 rows RETURNING),
 *     not a silent "success" — assert RETURNING rows empty when policy rejects.
 *   - Idempotent upsert: double insert on same unique key → update, not error.
 *
 * Fixtures: Alice=1 (athlete), Bob=2 (athlete), Carol=3 (coach), Diana=4 (admin).
 * Group 1 = Cadets (Alice is a member via seed.sql).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { asUser, asServiceRole, resetDb } from "./_helpers";

const ALICE = { appUserId: 1, appUserRole: "athlete" } as const;
const BOB = { appUserId: 2, appUserRole: "athlete" } as const;
const CAROL = { appUserId: 3, appUserRole: "coach" } as const;
const DIANA = { appUserId: 4, appUserRole: "admin" } as const;

beforeAll(async () => {
  await resetDb();
});

// =============================================================================
// strength_planning_slots (group-level)
// =============================================================================

describe("strength_planning_slots RLS", () => {
  it("athlete CANNOT insert a group slot", async () => {
    await expect(
      asUser(ALICE, async (c) => {
        await c.query(
          `INSERT INTO strength_planning_slots
             (group_id, week_start, day_of_week, time_slot)
           VALUES (1, '2026-05-04', 0, 'evening')`,
        );
      }),
    ).rejects.toThrow(/row-level security|permission|policy/i);
  });

  it("coach CAN insert a group slot", async () => {
    const inserted = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO strength_planning_slots
           (group_id, week_start, day_of_week, time_slot)
         VALUES (1, '2026-05-04', 0, 'evening')
         RETURNING id`,
      );
      return r.rows;
    });
    expect(inserted).toHaveLength(1);
  });

  it("admin CAN insert a group slot", async () => {
    const inserted = await asUser(DIANA, async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO strength_planning_slots
           (group_id, week_start, day_of_week, time_slot)
         VALUES (1, '2026-05-04', 1, 'evening')
         RETURNING id`,
      );
      return r.rows;
    });
    expect(inserted).toHaveLength(1);
  });

  it("athlete CAN read all group slots (SELECT is open)", async () => {
    await asServiceRole(async (c) => {
      await c.query(
        `INSERT INTO strength_planning_slots (group_id, week_start, day_of_week, time_slot)
         VALUES (1, '2026-05-04', 0, 'evening')
         ON CONFLICT DO NOTHING`,
      );
    });
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<{ group_id: number }>(
        `SELECT group_id FROM strength_planning_slots ORDER BY group_id`,
      );
      return r.rows;
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("coach CAN update a group slot", async () => {
    await asServiceRole(async (c) => {
      await c.query(
        `INSERT INTO strength_planning_slots (group_id, week_start, day_of_week, time_slot)
         VALUES (1, '2026-05-04', 0, 'evening')
         ON CONFLICT DO NOTHING`,
      );
    });
    const updated = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string }>(
        `UPDATE strength_planning_slots
           SET notes = 'Charge réduite'
           WHERE group_id = 1 AND week_start = '2026-05-04' AND day_of_week = 0
           RETURNING id`,
      );
      return r.rows;
    });
    expect(updated.length).toBeGreaterThanOrEqual(1);
  });

  it("athlete DELETE is a no-op (§113 trap): 0 rows returned, no error", async () => {
    const deleted = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string }>(
        `DELETE FROM strength_planning_slots
         WHERE group_id = 1 AND week_start = '2026-05-04'
         RETURNING id`,
      );
      return r.rows;
    });
    expect(deleted).toEqual([]);
  });

  it("coach CAN delete a group slot", async () => {
    // Seed a fresh slot to delete
    await asServiceRole(async (c) => {
      await c.query(
        `INSERT INTO strength_planning_slots (group_id, week_start, day_of_week, time_slot)
         VALUES (1, '2026-06-01', 2, 'morning')
         ON CONFLICT DO NOTHING`,
      );
    });
    const deleted = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string }>(
        `DELETE FROM strength_planning_slots
         WHERE group_id = 1 AND week_start = '2026-06-01'
         RETURNING id`,
      );
      return r.rows;
    });
    expect(deleted.length).toBeGreaterThanOrEqual(1);
  });

  it("idempotent upsert: same unique key → update not duplicate error", async () => {
    // Both upserts must run in the SAME transaction since asUser rollbacks each call.
    const result = await asUser(CAROL, async (c) => {
      const first = await c.query<{ id: string }>(
        `INSERT INTO strength_planning_slots
           (group_id, week_start, day_of_week, time_slot, notes)
         VALUES (1, '2026-05-11', 3, 'evening', 'First')
         ON CONFLICT (group_id, week_start, day_of_week, time_slot)
           DO UPDATE SET notes = excluded.notes
         RETURNING id`,
      );
      const second = await c.query<{ id: string; notes: string }>(
        `INSERT INTO strength_planning_slots
           (group_id, week_start, day_of_week, time_slot, notes)
         VALUES (1, '2026-05-11', 3, 'evening', 'Updated')
         ON CONFLICT (group_id, week_start, day_of_week, time_slot)
           DO UPDATE SET notes = excluded.notes
         RETURNING id, notes`,
      );
      return { first: first.rows, second: second.rows };
    });
    expect(result.first).toHaveLength(1);
    expect(result.second).toHaveLength(1);
    expect(result.second[0].id).toBe(result.first[0].id); // same row updated
    expect(result.second[0].notes).toBe("Updated");
  });
});

// =============================================================================
// strength_planning_slot_overrides (per-athlete)
// =============================================================================

describe("strength_planning_slot_overrides RLS", () => {
  it("athlete CANNOT insert an override (even for themselves)", async () => {
    await expect(
      asUser(ALICE, async (c) => {
        await c.query(
          `INSERT INTO strength_planning_slot_overrides
             (athlete_id, week_start, day_of_week, time_slot)
           VALUES (1, '2026-05-04', 0, 'evening')`,
        );
      }),
    ).rejects.toThrow(/row-level security|permission|policy/i);
  });

  it("coach CAN insert an override for any athlete", async () => {
    const inserted = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO strength_planning_slot_overrides
           (athlete_id, week_start, day_of_week, time_slot)
         VALUES (1, '2026-05-04', 0, 'evening')
         RETURNING id`,
      );
      return r.rows;
    });
    expect(inserted).toHaveLength(1);
  });

  it("admin CAN insert an override", async () => {
    const inserted = await asUser(DIANA, async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO strength_planning_slot_overrides
           (athlete_id, week_start, day_of_week, time_slot)
         VALUES (2, '2026-05-04', 1, 'evening')
         RETURNING id`,
      );
      return r.rows;
    });
    expect(inserted).toHaveLength(1);
  });

  it("athlete sees all overrides (SELECT is global)", async () => {
    await asServiceRole(async (c) => {
      await c.query(
        `INSERT INTO strength_planning_slot_overrides
           (athlete_id, week_start, day_of_week, time_slot)
         VALUES (1, '2026-05-18', 0, 'evening')
         ON CONFLICT DO NOTHING`,
      );
    });
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<{ athlete_id: number }>(
        `SELECT athlete_id FROM strength_planning_slot_overrides ORDER BY athlete_id`,
      );
      return r.rows;
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("athlete DELETE is a no-op (§113 trap): 0 rows returned, no error", async () => {
    await asServiceRole(async (c) => {
      await c.query(
        `INSERT INTO strength_planning_slot_overrides
           (athlete_id, week_start, day_of_week, time_slot)
         VALUES (1, '2026-05-11', 1, 'evening')
         ON CONFLICT DO NOTHING`,
      );
    });

    const deleted = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string }>(
        `DELETE FROM strength_planning_slot_overrides
         WHERE athlete_id = 1 AND week_start = '2026-05-11'
         RETURNING id`,
      );
      return r.rows;
    });
    expect(deleted).toEqual([]);
  });

  it("coach CAN delete an override", async () => {
    await asServiceRole(async (c) => {
      await c.query(
        `INSERT INTO strength_planning_slot_overrides
           (athlete_id, week_start, day_of_week, time_slot)
         VALUES (1, '2026-05-11', 1, 'evening')
         ON CONFLICT DO NOTHING`,
      );
    });
    const deleted = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string }>(
        `DELETE FROM strength_planning_slot_overrides
         WHERE athlete_id = 1 AND week_start = '2026-05-11'
         RETURNING id`,
      );
      return r.rows;
    });
    expect(deleted.length).toBeGreaterThanOrEqual(1);
  });

  it("athlete CANNOT update an existing override (§113-style silent no-op)", async () => {
    await asServiceRole(async (c) => {
      await c.query(
        `INSERT INTO strength_planning_slot_overrides
           (athlete_id, week_start, day_of_week, time_slot, notes)
         VALUES (1, '2026-05-18', 2, 'morning', 'Original')
         ON CONFLICT DO NOTHING`,
      );
    });
    const updated = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string }>(
        `UPDATE strength_planning_slot_overrides
           SET notes = 'Hacked'
           WHERE athlete_id = 1 AND week_start = '2026-05-18'
           RETURNING id`,
      );
      return r.rows;
    });
    expect(updated).toEqual([]);
  });

  it("coach CAN update an existing override", async () => {
    const updated = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string; notes: string }>(
        `UPDATE strength_planning_slot_overrides
           SET notes = 'Adapté par coach'
           WHERE athlete_id = 1 AND week_start = '2026-05-18' AND day_of_week = 2
           RETURNING id, notes`,
      );
      return r.rows;
    });
    expect(updated.length).toBeGreaterThanOrEqual(1);
    expect(updated[0].notes).toBe("Adapté par coach");
  });
});

// =============================================================================
// strength_planning_week_meta (group-level)
// =============================================================================

describe("strength_planning_week_meta RLS", () => {
  it("coach CAN upsert group-level week meta", async () => {
    const inserted = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO strength_planning_week_meta
           (group_id, week_start, week_type, notes)
         VALUES (1, '2026-05-04', 'force', 'Charge montante')
         ON CONFLICT (group_id, week_start) DO UPDATE
           SET week_type = excluded.week_type, notes = excluded.notes
         RETURNING id`,
      );
      return r.rows;
    });
    expect(inserted).toHaveLength(1);
  });

  it("athlete CANNOT insert group-level week meta", async () => {
    await expect(
      asUser(ALICE, async (c) => {
        await c.query(
          `INSERT INTO strength_planning_week_meta (group_id, week_start, week_type)
           VALUES (1, '2026-05-11', 'taper')`,
        );
      }),
    ).rejects.toThrow(/row-level security|permission|policy/i);
  });

  it("athlete CAN read group week meta", async () => {
    await asServiceRole(async (c) => {
      await c.query(
        `INSERT INTO strength_planning_week_meta (group_id, week_start, week_type, notes)
         VALUES (1, '2026-05-04', 'force', 'Charge montante')
         ON CONFLICT (group_id, week_start) DO NOTHING`,
      );
    });
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<{ group_id: number }>(
        `SELECT group_id FROM strength_planning_week_meta`,
      );
      return r.rows;
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// strength_planning_week_overrides (per-athlete)
// =============================================================================

describe("strength_planning_week_overrides RLS", () => {
  it("coach CAN upsert week_type/notes for any athlete", async () => {
    const inserted = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO strength_planning_week_overrides
           (athlete_id, week_start, week_type, notes)
         VALUES (1, '2026-05-04', 'taper', 'Allègement individuel')
         RETURNING id`,
      );
      return r.rows;
    });
    expect(inserted).toHaveLength(1);
  });

  it("athlete CANNOT insert their own week override", async () => {
    await expect(
      asUser(BOB, async (c) => {
        await c.query(
          `INSERT INTO strength_planning_week_overrides
             (athlete_id, week_start, week_type)
           VALUES (2, '2026-05-04', 'reprise')`,
        );
      }),
    ).rejects.toThrow(/row-level security|permission|policy/i);
  });

  it("athlete CAN read all week overrides (SELECT is global)", async () => {
    await asServiceRole(async (c) => {
      await c.query(
        `INSERT INTO strength_planning_week_overrides (athlete_id, week_start, week_type, notes)
         VALUES (1, '2026-05-04', 'taper', 'Allègement individuel')
         ON CONFLICT DO NOTHING`,
      );
    });
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<{ athlete_id: number }>(
        `SELECT athlete_id FROM strength_planning_week_overrides`,
      );
      return r.rows;
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("athlete DELETE on week override is a no-op (§113 trap)", async () => {
    const deleted = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string }>(
        `DELETE FROM strength_planning_week_overrides
         WHERE athlete_id = 1 AND week_start = '2026-05-04'
         RETURNING id`,
      );
      return r.rows;
    });
    expect(deleted).toEqual([]);
  });
});
