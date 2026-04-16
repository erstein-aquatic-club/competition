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
});
