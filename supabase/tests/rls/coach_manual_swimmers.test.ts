/**
 * RLS: public.coach_manual_swimmers
 *
 * Coverage for §126 — nageurs manuels sans compte (chrono coach).
 * 3 policies: select_own, insert_own, delete_own — all keyed on auth.uid() (UUID).
 *
 * Policy design: each coach sees/inserts/deletes ONLY their own rows.
 * Athletes see nothing (no policy grants them access).
 *
 * Note: coach_id is a UUID matching auth.uid() (the JWT `sub` claim),
 * NOT app_user_id() (integer). So we use `authUid` in AuthClaims.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { asUser, asServiceRole, resetDb } from "./_helpers";

// Deterministic UUIDs for test identities
const COACH_A_UID = "11111111-1111-1111-1111-111111111111";
const COACH_B_UID = "22222222-2222-2222-2222-222222222222";
const ATHLETE_UID = "33333333-3333-3333-3333-333333333333";

const COACH_A = { appUserId: 1, appUserRole: "coach" as const, authUid: COACH_A_UID };
const COACH_B = { appUserId: 2, appUserRole: "coach" as const, authUid: COACH_B_UID };
const ATHLETE = { appUserId: 3, appUserRole: "athlete" as const, authUid: ATHLETE_UID };

describe("RLS coach_manual_swimmers", () => {
  beforeAll(async () => {
    await resetDb();
  });

  beforeEach(async () => {
    await asServiceRole(async (db) => {
      await db.query("DELETE FROM public.coach_manual_swimmers");
    });
  });

  it("coach A can INSERT with own coach_id", async () => {
    await asUser(COACH_A, async (db) => {
      const r = await db.query(
        "INSERT INTO public.coach_manual_swimmers(coach_id, display_name) VALUES ($1, $2) RETURNING id",
        [COACH_A_UID, "Invité 1"],
      );
      expect(r.rows.length).toBe(1);
    });
  });

  it("coach A cannot INSERT with coach_id of coach B", async () => {
    await expect(
      asUser(COACH_A, async (db) => {
        await db.query(
          "INSERT INTO public.coach_manual_swimmers(coach_id, display_name) VALUES ($1, $2)",
          [COACH_B_UID, "Spoof"],
        );
      }),
    ).rejects.toThrow();
  });

  it("coach A sees only own manual swimmers", async () => {
    await asServiceRole(async (db) => {
      await db.query(
        "INSERT INTO public.coach_manual_swimmers(coach_id, display_name) VALUES ($1, 'A1'), ($2, 'B1')",
        [COACH_A_UID, COACH_B_UID],
      );
    });
    await asUser(COACH_A, async (db) => {
      const r = await db.query(
        "SELECT display_name FROM public.coach_manual_swimmers",
      );
      expect(r.rows.map((x: { display_name: string }) => x.display_name)).toEqual(["A1"]);
    });
  });

  it("coach A cannot DELETE coach B entries (silent no-op, row preserved)", async () => {
    // Insert B1 outside any transaction so it persists across the asUser rollback
    await asServiceRole(async (db) => {
      await db.query(
        "INSERT INTO public.coach_manual_swimmers(coach_id, display_name) VALUES ($1, 'B1')",
        [COACH_B_UID],
      );
    });
    // asUser always rolls back — the DELETE no-op is inside a transaction
    await asUser(COACH_A, async (db) => {
      const r = await db.query("DELETE FROM public.coach_manual_swimmers");
      // RLS filters Coach B's row out — 0 rows affected, no error
      expect(r.rowCount).toBe(0);
    });
    // B1 was never in the asUser transaction, so it still exists in the real DB
    await asServiceRole(async (db) => {
      const r = await db.query(
        "SELECT count(*)::int AS c FROM public.coach_manual_swimmers",
      );
      expect(r.rows[0].c).toBe(1);
    });
  });

  it("athlete sees no manual swimmers", async () => {
    await asServiceRole(async (db) => {
      await db.query(
        "INSERT INTO public.coach_manual_swimmers(coach_id, display_name) VALUES ($1, 'A1')",
        [COACH_A_UID],
      );
    });
    await asUser(ATHLETE, async (db) => {
      const r = await db.query(
        "SELECT count(*)::int AS c FROM public.coach_manual_swimmers",
      );
      expect(r.rows[0].c).toBe(0);
    });
  });
});
