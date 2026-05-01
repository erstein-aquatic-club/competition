/**
 * §184 — RLS tests for coach_manual_swimmers UPDATE policy
 *
 * Verifies that:
 * - A coach can INSERT and UPDATE their own manual swimmer.
 * - Another coach cannot UPDATE a foreign manual swimmer.
 * - CHECK constraint on `sex` is enforced.
 * - A coach cannot reassign coach_id to another coach.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { asUser, asServiceRole, resetDb } from "./_helpers";

const CAROL_UID = "00000000-0000-0000-0000-000000000003";
const EVE_UID   = "00000000-0000-0000-0000-000000000005";

const CAROL = { appUserId: 3, appUserRole: "coach" as const, authUid: CAROL_UID };
const EVE   = { appUserId: 5, appUserRole: "coach" as const, authUid: EVE_UID };

let swimmerId: string;

beforeAll(async () => {
  await resetDb();
  // Seed a manual swimmer for Carol so UPDATE tests have a target row.
  await asServiceRole(async (c) => {
    const r = await c.query(
      `INSERT INTO coach_manual_swimmers (coach_id, display_name, birthdate, sex)
       VALUES ($1, 'Bob', '2010-01-01', 'M') RETURNING id`,
      [CAROL_UID],
    );
    swimmerId = r.rows[0].id;
  });
});

describe("coach_manual_swimmers UPDATE RLS (§184)", () => {
  it("coach A can INSERT manual swimmer", async () => {
    const rows = await asUser(CAROL, async (c) => {
      const r = await c.query(
        `INSERT INTO coach_manual_swimmers (coach_id, display_name, birthdate, sex)
         VALUES ($1, 'Marc', '2012-03-15', 'M') RETURNING id`,
        [CAROL_UID],
      );
      return r.rowCount;
    });
    expect(rows).toBe(1);
  });

  it("coach A can UPDATE their own manual swimmer", async () => {
    const affected = await asUser(CAROL, async (c) => {
      const r = await c.query(
        "UPDATE coach_manual_swimmers SET display_name = 'Robert', sex = 'F' WHERE id = $1",
        [swimmerId],
      );
      return r.rowCount;
    });
    expect(affected).toBe(1);
  });

  it("coach B UPDATE coach A manual swimmer → 0 rows affected", async () => {
    const affected = await asUser(EVE, async (c) => {
      const r = await c.query(
        "UPDATE coach_manual_swimmers SET display_name = 'Hacked' WHERE id = $1",
        [swimmerId],
      );
      return r.rowCount;
    });
    expect(affected).toBe(0);
  });

  it("coach A UPDATE sex to 'X' → CHECK constraint error", async () => {
    await expect(
      asUser(CAROL, async (c) => {
        await c.query(
          "UPDATE coach_manual_swimmers SET sex = 'X' WHERE id = $1",
          [swimmerId],
        );
      }),
    ).rejects.toThrow(/check/i);
  });

  it("coach A UPDATE coach_id to EVE → 0 rows affected (USING blocks)", async () => {
    // After UPDATE SET coach_id = EVE_UID, the USING (coach_id = auth.uid()) for the
    // resulting row would still bind on the WHERE (row visible to Carol before update).
    // The WITH CHECK (coach_id = auth.uid()) fires against the NEW row — EVE_UID ≠ CAROL_UID
    // → update blocked.
    await expect(
      asUser(CAROL, async (c) => {
        await c.query(
          "UPDATE coach_manual_swimmers SET coach_id = $1 WHERE id = $2",
          [EVE_UID, swimmerId],
        );
      }),
    ).rejects.toThrow(/row-level security/i);
  });
});
