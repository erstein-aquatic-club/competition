/**
 * §174 P0/P1 #5 — migration 00146_save_strength_run_assignment_authz.sql
 *
 * The SECURITY DEFINER RPC `save_strength_run_atomic` was unconditionally
 * accepting `assignment_id` and marking that row "completed". Pre-§174, a
 * malicious caller could pass any assignment_id (including one that targets
 * another athlete) and corrupt the assignment lifecycle.
 *
 * Migration 00146 adds an explicit ownership check: the assignment must
 * target the same athlete the run is being saved for, OR the caller must
 * be admin. Group-targeted assignments (target_user_id NULL) require
 * coach/admin to mark completed.
 *
 * This test file covers the security check via a stub function
 * `_test_save_strength_run_authz` defined in supabase/tests/schema.sql.
 * The stub mirrors the IF blocks of the production RPC verbatim — keep
 * them in sync when the RPC's authz logic evolves.
 *
 * Seed (seed.sql):
 *   sa1: target=Alice (1),    visible_from=NULL — direct, published
 *   sa2: target=Alice (1),    visible_from=2030 — direct, hidden
 *   sa3: target_group=Cadets, target_user_id=NULL — group, Alice in Cadets
 *   sa4: target_group=Juniors,target_user_id=NULL — group, Bob in Juniors
 *   sa5: no target — assigned_by Carol only
 */
import { describe, it, expect, beforeAll } from "vitest";
import { asUser, resetDb } from "./_helpers";

const ALICE = { appUserId: 1, appUserRole: "athlete" as const };
const BOB = { appUserId: 2, appUserRole: "athlete" as const };
const CAROL = { appUserId: 3, appUserRole: "coach" as const };
const DIANA = { appUserId: 4, appUserRole: "admin" as const };

beforeAll(async () => {
  await resetDb();
});

describe("save_strength_run_atomic authz (§174 P0/P1 #5)", () => {
  describe("athlete identity check", () => {
    it("athlete CAN save run for themselves (no assignment)", async () => {
      const result = await asUser(ALICE, async (c) => {
        const r = await c.query<{ ok: string }>(
          "SELECT _test_save_strength_run_authz($1, NULL) AS ok",
          [1],
        );
        return r.rows[0].ok;
      });
      expect(result).toBe("ok");
    });

    it("athlete CANNOT save run for another athlete (forbidden)", async () => {
      await expect(
        asUser(ALICE, async (c) => {
          await c.query(
            "SELECT _test_save_strength_run_authz($1, NULL)",
            [2], // Bob's id
          );
        }),
      ).rejects.toThrow(/cannot save run for another athlete/i);
    });

    it("coach CAN save run on behalf of any athlete", async () => {
      const result = await asUser(CAROL, async (c) => {
        const r = await c.query<{ ok: string }>(
          "SELECT _test_save_strength_run_authz($1, NULL) AS ok",
          [1],
        );
        return r.rows[0].ok;
      });
      expect(result).toBe("ok");
    });

    it("admin CAN save run on behalf of any athlete", async () => {
      const result = await asUser(DIANA, async (c) => {
        const r = await c.query<{ ok: string }>(
          "SELECT _test_save_strength_run_authz($1, NULL) AS ok",
          [2],
        );
        return r.rows[0].ok;
      });
      expect(result).toBe("ok");
    });
  });

  describe("assignment_id ownership check (the §174 fix)", () => {
    it("athlete CAN reference an assignment that targets them (sa1 → Alice)", async () => {
      const result = await asUser(ALICE, async (c) => {
        const r = await c.query<{ ok: string }>(
          "SELECT _test_save_strength_run_authz($1, $2) AS ok",
          [1, 1], // athlete=Alice, assignment sa1 targets Alice
        );
        return r.rows[0].ok;
      });
      expect(result).toBe("ok");
    });

    it("athlete CANNOT use an assignment targeting another athlete (forged assignment_id)", async () => {
      // Forge: pretend Bob's run uses Alice's direct assignment sa1.
      // Pre-00146: would silently UPDATE sa1 to 'completed'.
      // Post-00146: rejects with 42501.
      await expect(
        asUser(BOB, async (c) => {
          await c.query("SELECT _test_save_strength_run_authz($1, $2)", [
            2, // athlete_id = Bob
            1, // assignment sa1 targets Alice (1), not Bob
          ]);
        }),
      ).rejects.toThrow(/does not target athlete/i);
    });

    it("athlete CANNOT use a group-targeted assignment (target_user_id NULL)", async () => {
      // sa3 has target_user_id=NULL (group target Cadets). Even though Alice
      // is in Cadets, the RPC requires coach/admin to mark group assignments
      // completed (no per-athlete completion semantics).
      await expect(
        asUser(ALICE, async (c) => {
          await c.query("SELECT _test_save_strength_run_authz($1, $2)", [
            1, // athlete=Alice
            3, // sa3 = group Cadets (target_user_id NULL)
          ]);
        }),
      ).rejects.toThrow(/cannot mark non-direct assignment completed/i);
    });

    it("admin CAN use an assignment targeting a different athlete (admin bypass)", async () => {
      const result = await asUser(DIANA, async (c) => {
        const r = await c.query<{ ok: string }>(
          "SELECT _test_save_strength_run_authz($1, $2) AS ok",
          [2, 1], // admin saves Bob's run with assignment sa1 (Alice's)
        );
        return r.rows[0].ok;
      });
      expect(result).toBe("ok");
    });

    it("coach CAN use a group-targeted assignment (coach bypass for non-direct)", async () => {
      const result = await asUser(CAROL, async (c) => {
        const r = await c.query<{ ok: string }>(
          "SELECT _test_save_strength_run_authz($1, $2) AS ok",
          [1, 3], // coach marks group assignment sa3 completed for Alice
        );
        return r.rows[0].ok;
      });
      expect(result).toBe("ok");
    });

    it("coach CANNOT use a direct assignment targeting another athlete (non-admin coach)", async () => {
      // sa1 targets Alice (target_user_id=1). Carol is a coach but not admin.
      // She tries to mark sa1 completed for Bob (athlete_id=2). Should reject:
      // assignment target (1) <> p_athlete_id (2) AND caller_role <> 'admin'.
      await expect(
        asUser(CAROL, async (c) => {
          await c.query("SELECT _test_save_strength_run_authz($1, $2)", [
            2, // athlete=Bob
            1, // sa1 targets Alice
          ]);
        }),
      ).rejects.toThrow(/does not target athlete/i);
    });
  });

  describe("input validation", () => {
    it("NULL athlete_id is rejected (22023)", async () => {
      await expect(
        asUser(ALICE, async (c) => {
          await c.query("SELECT _test_save_strength_run_authz(NULL, NULL)");
        }),
      ).rejects.toThrow(/athlete_id is required/i);
    });
  });
});
