/**
 * §184 — RLS tests for coach_pace_zones
 *
 * Verifies that:
 * - A coach can INSERT/UPDATE/SELECT only their own zones row.
 * - Another coach cannot SELECT, UPDATE, or spoof INSERT for a foreign coach_id.
 * - PostgreSQL CHECK constraints (order and bounds) are enforced.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { asUser, asServiceRole, resetDb } from "./_helpers";

const CAROL_UID = "00000000-0000-0000-0000-000000000003";
const EVE_UID   = "00000000-0000-0000-0000-000000000005";

const CAROL = { appUserId: 3, appUserRole: "coach" as const, authUid: CAROL_UID };
const EVE   = { appUserId: 5, appUserRole: "coach" as const, authUid: EVE_UID };

beforeAll(async () => {
  await resetDb();
  // Seed Carol's zones so UPDATE/SELECT tests have a row to work with.
  await asServiceRole(async (c) => {
    await c.query(
      `INSERT INTO coach_pace_zones (coach_id, v0_pct, v1_pct, v2_pct, v3_pct, max_pct)
       VALUES ($1, 140, 130, 115, 110, 105)
       ON CONFLICT (coach_id) DO UPDATE
         SET v0_pct=140, v1_pct=130, v2_pct=115, v3_pct=110, max_pct=105`,
      [CAROL_UID],
    );
  });
});

describe("coach_pace_zones RLS (§184)", () => {
  it("coach A can INSERT their own zones row (upsert path exercises INSERT policy)", async () => {
    // No DELETE policy on coach_pace_zones; use ON CONFLICT to exercise the INSERT policy.
    const rows = await asUser(CAROL, async (c) => {
      const r = await c.query(
        `INSERT INTO coach_pace_zones (coach_id, v0_pct, v1_pct, v2_pct, v3_pct, max_pct)
         VALUES ($1, 140, 130, 115, 110, 105)
         ON CONFLICT (coach_id) DO UPDATE SET updated_at = now()
         RETURNING coach_id`,
        [CAROL_UID],
      );
      return r.rowCount;
    });
    expect(rows).toBe(1);
  });

  it("coach A can UPDATE their own zones row", async () => {
    const affected = await asUser(CAROL, async (c) => {
      const r = await c.query(
        "UPDATE coach_pace_zones SET v0_pct = 145 WHERE coach_id = $1",
        [CAROL_UID],
      );
      return r.rowCount;
    });
    expect(affected).toBe(1);
  });

  it("coach A SELECT their zones → 1 row", async () => {
    const count = await asUser(CAROL, async (c) => {
      const r = await c.query("SELECT * FROM coach_pace_zones WHERE coach_id = $1", [CAROL_UID]);
      return r.rowCount;
    });
    expect(count).toBe(1);
  });

  it("coach B SELECT coach A zones → 0 rows (RLS isolation)", async () => {
    const count = await asUser(EVE, async (c) => {
      const r = await c.query("SELECT * FROM coach_pace_zones WHERE coach_id = $1", [CAROL_UID]);
      return r.rowCount;
    });
    expect(count).toBe(0);
  });

  it("coach B UPDATE coach A zones → 0 rows affected", async () => {
    const affected = await asUser(EVE, async (c) => {
      const r = await c.query(
        "UPDATE coach_pace_zones SET v0_pct = 999 WHERE coach_id = $1",
        [CAROL_UID],
      );
      return r.rowCount;
    });
    expect(affected).toBe(0);
  });

  it("coach B INSERT with coach_id = coach A → RLS WITH CHECK error", async () => {
    await expect(
      asUser(EVE, async (c) => {
        await c.query(
          `INSERT INTO coach_pace_zones (coach_id, v0_pct, v1_pct, v2_pct, v3_pct, max_pct)
           VALUES ($1, 140, 130, 115, 110, 105)`,
          [CAROL_UID],
        );
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it("INSERT with v2_pct=80 < v3_pct=110 → CHECK order constraint error", async () => {
    await expect(
      asUser(CAROL, async (c) => {
        // Update violates v2_pct >= v3_pct (80 < 110)
        await c.query(
          "UPDATE coach_pace_zones SET v2_pct = 80 WHERE coach_id = $1",
          [CAROL_UID],
        );
      }),
    ).rejects.toThrow(/check/i);
  });

  it("INSERT with v0_pct=250 → CHECK BETWEEN 100 AND 200 error", async () => {
    await expect(
      asUser(CAROL, async (c) => {
        await c.query(
          "UPDATE coach_pace_zones SET v0_pct = 250 WHERE coach_id = $1",
          [CAROL_UID],
        );
      }),
    ).rejects.toThrow(/check/i);
  });
});
