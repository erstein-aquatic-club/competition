/**
 * RLS: public.session_assignments
 *
 * Hot path n°1: every swim/strength session assigned by the coach transits here.
 * The SELECT policy (326 chars) has 4 branches:
 *   1. coach/admin bypass
 *   2. assigned_by = app_user_id() (creator sees own)
 *   3. visible_from gate + direct target (target_user_id)
 *   4. visible_from gate + group target (target_group_id via group_members subquery)
 *
 * The visible_from gate is the critical regression target: it prevents athletes
 * from seeing draft sessions before the coach publishes them. A bug here leaks
 * unpublished content to the athlete's calendar.
 *
 * WRITE policy is simple: coach/admin only. Athlete cannot mutate.
 *
 * Fixtures (seed.sql):
 *   sa1: direct Alice, visible now    | sa2: direct Alice, future visible_from (hidden)
 *   sa3: group Cadets, visible now    | sa4: group Juniors, visible now
 *   sa5: no target, assigned_by Carol | Groups: Alice in Cadets, Bob in Juniors
 */

import { describe, it, expect, beforeAll } from "vitest";
import { asUser, resetDb } from "./_helpers";

const ALICE = { appUserId: 1, appUserRole: "athlete" as const };
const BOB = { appUserId: 2, appUserRole: "athlete" as const };
const CAROL = { appUserId: 3, appUserRole: "coach" as const };
const DIANA = { appUserId: 4, appUserRole: "admin" as const };
const EVE = { appUserId: 5, appUserRole: "coach" as const };

beforeAll(async () => {
  await resetDb();
});

describe("session_assignments RLS", () => {
  describe("SELECT — visible_from gate", () => {
    it("Alice sees sa1 (direct target, visible_from NULL = published)", async () => {
      const rows = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: number }>(
          "SELECT id FROM session_assignments WHERE id = 1",
        );
        return r.rows;
      });
      expect(rows).toEqual([{ id: 1 }]);
    });

    it("Alice does NOT see sa2 (direct target, but visible_from in future)", async () => {
      const rows = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: number }>(
          "SELECT id FROM session_assignments WHERE id = 2",
        );
        return r.rows;
      });
      expect(rows).toEqual([]);
    });

    it("coach sees sa2 regardless of visible_from (bypass)", async () => {
      const rows = await asUser(CAROL, async (c) => {
        const r = await c.query<{ id: number }>(
          "SELECT id FROM session_assignments WHERE id = 2",
        );
        return r.rows;
      });
      expect(rows).toEqual([{ id: 2 }]);
    });
  });

  describe("SELECT — group_members subquery", () => {
    it("Alice sees sa3 (group Cadets — she's a member)", async () => {
      const rows = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: number }>(
          "SELECT id FROM session_assignments WHERE id = 3",
        );
        return r.rows;
      });
      expect(rows).toEqual([{ id: 3 }]);
    });

    it("Alice does NOT see sa4 (group Juniors — she's not a member)", async () => {
      const rows = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: number }>(
          "SELECT id FROM session_assignments WHERE id = 4",
        );
        return r.rows;
      });
      expect(rows).toEqual([]);
    });

    it("Bob sees sa4 (group Juniors — he's a member)", async () => {
      const rows = await asUser(BOB, async (c) => {
        const r = await c.query<{ id: number }>(
          "SELECT id FROM session_assignments WHERE id = 4",
        );
        return r.rows;
      });
      expect(rows).toEqual([{ id: 4 }]);
    });
  });

  describe("SELECT — assigned_by branch", () => {
    it("Alice does NOT see sa5 (no target, created by Carol)", async () => {
      const rows = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: number }>(
          "SELECT id FROM session_assignments WHERE id = 5",
        );
        return r.rows;
      });
      expect(rows).toEqual([]);
    });

    it("Carol sees sa5 (assigned_by = her own id)", async () => {
      const rows = await asUser(CAROL, async (c) => {
        const r = await c.query<{ id: number }>(
          "SELECT id FROM session_assignments WHERE id = 5",
        );
        return r.rows;
      });
      expect(rows).toEqual([{ id: 5 }]);
    });
  });

  describe("SELECT — full visibility matrix", () => {
    it("Alice sees exactly sa1 + sa3 (direct visible + group visible)", async () => {
      const rows = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: number }>(
          "SELECT id FROM session_assignments ORDER BY id",
        );
        return r.rows;
      });
      expect(rows.map((r) => r.id)).toEqual([1, 3]);
    });

    it("admin sees all 5", async () => {
      const rows = await asUser(DIANA, async (c) => {
        const r = await c.query<{ id: number }>(
          "SELECT id FROM session_assignments ORDER BY id",
        );
        return r.rows;
      });
      expect(rows).toHaveLength(5);
    });
  });

  describe("WRITE — athlete blocked", () => {
    it("athlete CANNOT delete an assignment (even their own)", async () => {
      const deleted = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: number }>(
          "DELETE FROM session_assignments WHERE id = 1 RETURNING id",
        );
        return r.rows;
      });
      expect(deleted).toEqual([]);
    });

    it("coach CAN delete an assignment", async () => {
      const deleted = await asUser(CAROL, async (c) => {
        const r = await c.query<{ id: number }>(
          "DELETE FROM session_assignments WHERE id = 5 RETURNING id",
        );
        return r.rows;
      });
      expect(deleted).toEqual([{ id: 5 }]);
    });
  });

  // ===========================================================================
  // §174 P0 #1 — migration 00145_assignments_write_ownership.sql
  //
  // Pre-§174, `assignments_write FOR ALL` granted any coach the right to
  // UPDATE/DELETE assignments owned by ANOTHER coach. Migration 00145 splits
  // the policy into INSERT (any coach/admin), UPDATE/DELETE (admin OR
  // coach owner via assigned_by = app_user_id()).
  //
  // All seed assignments (sa1..sa5) are owned by Carol (assigned_by = 3).
  // Eve (id=5, role=coach) owns nothing — she's the cross-coach attacker.
  // ===========================================================================
  describe("WRITE — cross-coach ownership (§174 P0 #1)", () => {
    it("Eve coach CANNOT update Carol's assignment (silent no-op)", async () => {
      const updated = await asUser(EVE, async (c) => {
        const r = await c.query<{ id: number }>(
          `UPDATE session_assignments SET status = 'completed'
           WHERE id = 1 RETURNING id`,
        );
        return r.rows;
      });
      // Pre-00145: would return [{id:1}]. Post-00145: empty (RLS blocks UPDATE).
      expect(updated).toEqual([]);
    });

    it("Eve coach CANNOT delete Carol's assignment (silent no-op)", async () => {
      const deleted = await asUser(EVE, async (c) => {
        const r = await c.query<{ id: number }>(
          "DELETE FROM session_assignments WHERE id = 1 RETURNING id",
        );
        return r.rows;
      });
      // Pre-00145: would return [{id:1}]. Post-00145: empty.
      expect(deleted).toEqual([]);
    });

    it("Eve coach CAN insert her own assignment (INSERT is open to all coach/admin)", async () => {
      const inserted = await asUser(EVE, async (c) => {
        const r = await c.query<{ id: number; assigned_by: number }>(
          `INSERT INTO session_assignments
             (assignment_type, target_user_id, assigned_by, scheduled_date)
           VALUES ('swim', 1, 5, '2026-05-01')
           RETURNING id, assigned_by`,
        );
        return r.rows;
      });
      expect(inserted).toHaveLength(1);
      expect(inserted[0].assigned_by).toBe(5);
    });

    it("Eve coach CAN update her own assignment (assigned_by = her id)", async () => {
      const updated = await asUser(EVE, async (c) => {
        // Insert + update in same transaction (rollback semantics of asUser).
        const ins = await c.query<{ id: number }>(
          `INSERT INTO session_assignments
             (assignment_type, target_user_id, assigned_by, scheduled_date)
           VALUES ('swim', 1, 5, '2026-05-02')
           RETURNING id`,
        );
        const newId = ins.rows[0].id;
        const upd = await c.query<{ id: number }>(
          `UPDATE session_assignments SET status = 'completed'
           WHERE id = $1 RETURNING id`,
          [newId],
        );
        return upd.rows;
      });
      expect(updated).toHaveLength(1);
    });

    it("admin CAN update any assignment (admin bypass)", async () => {
      const updated = await asUser(DIANA, async (c) => {
        const r = await c.query<{ id: number }>(
          `UPDATE session_assignments SET status = 'completed'
           WHERE id = 1 RETURNING id`,
        );
        return r.rows;
      });
      expect(updated).toEqual([{ id: 1 }]);
    });

    it("admin CAN delete any assignment (admin bypass)", async () => {
      const deleted = await asUser(DIANA, async (c) => {
        const r = await c.query<{ id: number }>(
          "DELETE FROM session_assignments WHERE id = 2 RETURNING id",
        );
        return r.rows;
      });
      expect(deleted).toEqual([{ id: 2 }]);
    });

    it("Carol CAN update her own assignment (regression: §174 must not break the legitimate path)", async () => {
      const updated = await asUser(CAROL, async (c) => {
        const r = await c.query<{ id: number }>(
          `UPDATE session_assignments SET status = 'completed'
           WHERE id = 1 RETURNING id`,
        );
        return r.rows;
      });
      expect(updated).toEqual([{ id: 1 }]);
    });
  });
});
