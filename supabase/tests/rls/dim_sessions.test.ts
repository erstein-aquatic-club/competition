/**
 * RLS: public.dim_sessions
 *
 * Regression coverage for §113 (silent DELETE no-op when athlete tries to
 * remove another athlete's session). The original bug was that the policy
 * filtered the row out, so PostgREST returned 204 with 0 rows affected, which
 * the JS layer happily reported as "success".
 *
 * We test all 4 CRUD policies: SELECT, INSERT, UPDATE, DELETE.
 *
 * Fixtures (from seed.sql):
 *   - users:        Alice (id=1, athlete), Bob (id=2, athlete), Carol (coach), Diana (admin)
 *   - dim_sessions: Alice owns id=1, id=2 — Bob owns id=3
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asUser, asServiceRole, resetDb, pool } from "./_helpers";

const ALICE = { appUserId: 1, appUserRole: "athlete" } as const;
const BOB = { appUserId: 2, appUserRole: "athlete" } as const;
const CAROL = { appUserId: 3, appUserRole: "coach" } as const;
const DIANA = { appUserId: 4, appUserRole: "admin" } as const;

beforeAll(async () => {
  await resetDb();
});

afterAll(async () => {
  await pool.end();
});

describe("dim_sessions RLS", () => {
  describe("SELECT policy", () => {
    it("athlete sees only their own sessions", async () => {
      const rows = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: number }>("SELECT id FROM dim_sessions ORDER BY id");
        return r.rows;
      });
      expect(rows.map((r) => r.id)).toEqual([1, 2]);
    });

    it("other athlete cannot see Alice's sessions", async () => {
      const rows = await asUser(BOB, async (c) => {
        const r = await c.query<{ id: number }>("SELECT id FROM dim_sessions ORDER BY id");
        return r.rows;
      });
      expect(rows.map((r) => r.id)).toEqual([3]);
    });

    it("coach sees all sessions", async () => {
      const rows = await asUser(CAROL, async (c) => {
        const r = await c.query<{ id: number }>("SELECT id FROM dim_sessions ORDER BY id");
        return r.rows;
      });
      expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
    });

    it("admin sees all sessions", async () => {
      const rows = await asUser(DIANA, async (c) => {
        const r = await c.query<{ id: number }>("SELECT id FROM dim_sessions ORDER BY id");
        return r.rows;
      });
      expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
    });
  });

  describe("DELETE policy (regression: §113)", () => {
    it("athlete CAN delete own session", async () => {
      const deleted = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: number }>("DELETE FROM dim_sessions WHERE id = 1 RETURNING id");
        return r.rows;
      });
      expect(deleted).toEqual([{ id: 1 }]);
    });

    it("athlete CANNOT delete another athlete's session (silent no-op = the §113 trap)", async () => {
      const deleted = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: number }>("DELETE FROM dim_sessions WHERE id = 3 RETURNING id");
        return r.rows;
      });
      // The RLS filter makes the row "invisible" to the DELETE — Postgres
      // reports 0 rows affected. PostgREST surfaces this as 204 success.
      // The bug in §113 was that JS treated this as deletion success.
      // The TEST here is: assert 0 rows returned, so the JS layer can be
      // patched to throw "expected 1 row, got 0" instead of false success.
      expect(deleted).toEqual([]);
    });

    it("coach CAN delete any session", async () => {
      const deleted = await asUser(CAROL, async (c) => {
        const r = await c.query<{ id: number }>("DELETE FROM dim_sessions WHERE id = 3 RETURNING id");
        return r.rows;
      });
      expect(deleted).toEqual([{ id: 3 }]);
    });

    it("admin CAN delete any session", async () => {
      const deleted = await asUser(DIANA, async (c) => {
        const r = await c.query<{ id: number }>("DELETE FROM dim_sessions WHERE id = 2 RETURNING id");
        return r.rows;
      });
      expect(deleted).toEqual([{ id: 2 }]);
    });
  });

  describe("UPDATE policy", () => {
    it("athlete CAN update own session", async () => {
      const updated = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: number; rpe: number }>(
          "UPDATE dim_sessions SET rpe = 9 WHERE id = 1 RETURNING id, rpe",
        );
        return r.rows;
      });
      expect(updated).toEqual([{ id: 1, rpe: 9 }]);
    });

    it("athlete CANNOT update another athlete's session", async () => {
      const updated = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: number }>(
          "UPDATE dim_sessions SET rpe = 9 WHERE id = 3 RETURNING id",
        );
        return r.rows;
      });
      expect(updated).toEqual([]);
    });
  });

  describe("INSERT policy", () => {
    it("athlete CAN insert a session for themselves", async () => {
      const inserted = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: number; athlete_id: number }>(
          `INSERT INTO dim_sessions (athlete_id, athlete_name, session_date, time_slot, duration, rpe)
           VALUES (1, 'Alice Athlete', '2026-04-10', 'morning', 60, 5)
           RETURNING id, athlete_id`,
        );
        return r.rows;
      });
      expect(inserted).toHaveLength(1);
      expect(inserted[0].athlete_id).toBe(1);
    });

    it("athlete CANNOT insert a session for another athlete", async () => {
      await expect(
        asUser(ALICE, async (c) => {
          await c.query(
            `INSERT INTO dim_sessions (athlete_id, athlete_name, session_date, time_slot, duration, rpe)
             VALUES (2, 'Bob Athlete', '2026-04-10', 'morning', 60, 5)`,
          );
        }),
      ).rejects.toThrow(/row-level security|new row violates/);
    });
  });

  describe("Sanity: rollback isolation between tests", () => {
    it("seed state is stable — Alice still has id=1 and id=2 in baseline", async () => {
      const rows = await asServiceRole(async (c) => {
        const r = await c.query<{ id: number }>(
          "SELECT id FROM dim_sessions WHERE athlete_id = 1 ORDER BY id",
        );
        return r.rows;
      });
      expect(rows.map((r) => r.id)).toEqual([1, 2]);
    });
  });
});
