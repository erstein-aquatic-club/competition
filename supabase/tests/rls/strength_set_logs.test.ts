/**
 * RLS: public.strength_session_runs + public.strength_set_logs
 *
 * Parent-child with EXISTS subquery: set_logs has no direct athlete_id column,
 * it inherits permissions from strength_session_runs via run_id FK.
 *
 * Key asymmetry to test: runs_delete excludes coach (admin-only), while
 * runs_insert/update/select include coach. This prevents a coach from
 * accidentally deleting an athlete's workout history.
 *
 * Fixtures (seed.sql):
 *   Runs: run1 (Alice), run2 (Bob)
 *   Logs: log1+log2 in run1 (Alice), log3 in run2 (Bob)
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

describe("strength_session_runs RLS", () => {
  it("Alice sees only her own run", async () => {
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: number }>("SELECT id FROM strength_session_runs ORDER BY id");
      return r.rows;
    });
    expect(rows.map((r) => r.id)).toEqual([1]);
  });

  it("coach sees all runs", async () => {
    const rows = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: number }>("SELECT id FROM strength_session_runs ORDER BY id");
      return r.rows;
    });
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });

  it("Alice CAN delete her own run", async () => {
    const deleted = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: number }>("DELETE FROM strength_session_runs WHERE id = 1 RETURNING id");
      return r.rows;
    });
    expect(deleted).toEqual([{ id: 1 }]);
  });

  it("coach CANNOT delete any run (admin-only on delete)", async () => {
    const deleted = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: number }>("DELETE FROM strength_session_runs WHERE id = 2 RETURNING id");
      return r.rows;
    });
    expect(deleted).toEqual([]);
  });

  it("admin CAN delete any run", async () => {
    const deleted = await asUser(DIANA, async (c) => {
      const r = await c.query<{ id: number }>("DELETE FROM strength_session_runs WHERE id = 2 RETURNING id");
      return r.rows;
    });
    expect(deleted).toEqual([{ id: 2 }]);
  });
});

describe("strength_set_logs RLS (EXISTS on parent run)", () => {
  it("Alice sees logs from her own runs only (log1, log2)", async () => {
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: number }>("SELECT id FROM strength_set_logs ORDER BY id");
      return r.rows;
    });
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });

  it("Alice does NOT see Bob's logs (log3)", async () => {
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: number }>("SELECT id FROM strength_set_logs WHERE id = 3");
      return r.rows;
    });
    expect(rows).toEqual([]);
  });

  it("coach sees all logs", async () => {
    const rows = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: number }>("SELECT id FROM strength_set_logs ORDER BY id");
      return r.rows;
    });
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("Alice CAN update her own log (write policy includes athlete via EXISTS)", async () => {
    const updated = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: number; reps: number }>(
        "UPDATE strength_set_logs SET reps = 12 WHERE id = 1 RETURNING id, reps",
      );
      return r.rows;
    });
    expect(updated).toEqual([{ id: 1, reps: 12 }]);
  });

  it("Alice CANNOT update Bob's log", async () => {
    const updated = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: number }>(
        "UPDATE strength_set_logs SET reps = 99 WHERE id = 3 RETURNING id",
      );
      return r.rows;
    });
    expect(updated).toEqual([]);
  });
});
