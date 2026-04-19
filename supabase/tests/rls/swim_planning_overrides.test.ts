/**
 * RLS: swim_planning_slot_overrides + swim_planning_week_overrides +
 *      swim_planning_week_meta
 *
 * Intent:
 *   - Read: everyone authenticated sees everything (like swim_planning_slots).
 *   - Write: only coach/admin. Athletes CANNOT insert/update/delete overrides.
 *   - Regression for §113: DELETE by athlete must be a no-op, not a silent
 *     "success" — assert RETURNING rows are empty when the policy rejects.
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

describe("swim_planning_slot_overrides RLS", () => {
  it("athlete CANNOT insert an override (even for themselves)", async () => {
    await expect(
      asUser(ALICE, async (c) => {
        await c.query(
          `INSERT INTO swim_planning_slot_overrides
             (athlete_id, week_start, day_of_week, time_slot, filiere)
           VALUES (1, '2026-05-04', 0, 'morning', 'VMA')`,
        );
      }),
    ).rejects.toThrow(/row-level security|permission|policy/i);
  });

  it("coach CAN insert an override for any athlete", async () => {
    const inserted = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO swim_planning_slot_overrides
           (athlete_id, week_start, day_of_week, time_slot, filiere)
         VALUES (1, '2026-05-04', 0, 'morning', 'VMA')
         RETURNING id`,
      );
      return r.rows;
    });
    expect(inserted).toHaveLength(1);
  });

  it("admin CAN insert an override", async () => {
    const inserted = await asUser(DIANA, async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO swim_planning_slot_overrides
           (athlete_id, week_start, day_of_week, time_slot, filiere)
         VALUES (2, '2026-05-04', 0, 'morning', 'Aerobie')
         RETURNING id`,
      );
      return r.rows;
    });
    expect(inserted).toHaveLength(1);
  });

  it("athlete sees all overrides (read is global)", async () => {
    await asServiceRole(async (c) => {
      await c.query(
        `INSERT INTO swim_planning_slot_overrides
           (athlete_id, week_start, day_of_week, time_slot, filiere)
         VALUES (1, '2026-05-18', 0, 'morning', 'VMA')
         ON CONFLICT DO NOTHING`,
      );
    });

    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<{ athlete_id: number }>(
        `SELECT athlete_id FROM swim_planning_slot_overrides ORDER BY athlete_id`,
      );
      return r.rows;
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("athlete DELETE is a no-op (§113 trap): 0 rows returned, no error", async () => {
    await asServiceRole(async (c) => {
      await c.query(
        `INSERT INTO swim_planning_slot_overrides
           (athlete_id, week_start, day_of_week, time_slot, filiere)
         VALUES (1, '2026-05-11', 1, 'evening', 'Force')
         ON CONFLICT DO NOTHING`,
      );
    });

    const deleted = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string }>(
        `DELETE FROM swim_planning_slot_overrides
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
        `INSERT INTO swim_planning_slot_overrides
           (athlete_id, week_start, day_of_week, time_slot, filiere)
         VALUES (1, '2026-05-11', 1, 'evening', 'Force')
         ON CONFLICT DO NOTHING`,
      );
    });

    const deleted = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string }>(
        `DELETE FROM swim_planning_slot_overrides
         WHERE athlete_id = 1 AND week_start = '2026-05-11'
         RETURNING id`,
      );
      return r.rows;
    });
    expect(deleted.length).toBeGreaterThanOrEqual(1);
  });

  it("athlete CANNOT update an existing override (§113-style silent no-op)", async () => {
    // Seed via service role
    await asServiceRole(async (c) => {
      await c.query(
        `INSERT INTO swim_planning_slot_overrides
           (athlete_id, week_start, day_of_week, time_slot, filiere)
         VALUES (1, '2026-05-18', 2, 'morning', 'Aerobie')
         ON CONFLICT DO NOTHING`,
      );
    });

    const updated = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string }>(
        `UPDATE swim_planning_slot_overrides
           SET filiere = 'VMA'
           WHERE athlete_id = 1 AND week_start = '2026-05-18'
           RETURNING id`,
      );
      return r.rows;
    });
    expect(updated).toEqual([]);
  });

  it("coach CAN update an existing override", async () => {
    const updated = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string; filiere: string }>(
        `UPDATE swim_planning_slot_overrides
           SET filiere = 'Force'
           WHERE athlete_id = 1 AND week_start = '2026-05-18'
           RETURNING id, filiere`,
      );
      return r.rows;
    });
    expect(updated.length).toBeGreaterThanOrEqual(1);
    expect(updated[0].filiere).toBe("Force");
  });
});

describe("swim_planning_week_overrides RLS", () => {
  it("coach CAN upsert week_type/notes for any athlete", async () => {
    const inserted = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO swim_planning_week_overrides
           (athlete_id, week_start, week_type, notes)
         VALUES (1, '2026-05-04', 'Intensif', 'Focus vitesse')
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
          `INSERT INTO swim_planning_week_overrides
             (athlete_id, week_start, week_type)
           VALUES (2, '2026-05-04', 'Recup')`,
        );
      }),
    ).rejects.toThrow(/row-level security|permission|policy/i);
  });
});

describe("swim_planning_week_meta RLS", () => {
  it("coach CAN upsert group-level week meta", async () => {
    const inserted = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO swim_planning_week_meta
           (group_id, week_start, week_type, notes)
         VALUES (1, '2026-05-04', 'Prepa', 'Charge montante')
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
          `INSERT INTO swim_planning_week_meta (group_id, week_start, week_type)
           VALUES (1, '2026-05-11', 'Test')`,
        );
      }),
    ).rejects.toThrow(/row-level security|permission|policy/i);
  });
});
