/**
 * RLS: public.strength_mesocycles + public.strength_planning_snapshots (§293)
 *
 * Chantier C+D "Moteur de génération du mésocycle". Both tables follow the
 * strength_assessments pattern:
 *   - `_own`   : athlete owns rows where athlete_id = app_user_id()
 *   - `_coach` : coach/admin get FULL access (FOR ALL) to any athlete's rows,
 *                club-wide — no per-athlete scoping (aligned with the sibling
 *                strength_assessments by migration 00171).
 *
 * Invariants tested:
 *   - A swimmer reads/writes ONLY his own mesocycles + snapshots.
 *   - A swimmer does NOT see another swimmer's rows.
 *   - A swimmer cannot insert a row for someone else (WITH CHECK).
 *   - A coach reads AND writes (revert) any swimmer's rows.
 *
 * Fixtures (seed.sql):
 *   strength_mesocycles         : d…1 (Alice), d…2 (Bob)
 *   strength_planning_snapshots : e…2 (Bob)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { asUser, asServiceRole, resetDb } from "./_helpers";

const ALICE = { appUserId: 1, appUserRole: "athlete" as const };
const CAROL = { appUserId: 3, appUserRole: "coach" as const };
const DIANA = { appUserId: 4, appUserRole: "admin" as const };

// Deterministic fixture UUIDs — last segment encodes the owning athlete id.
const A_MESO = "d0000000-0000-0000-0000-000000000001"; // Alice's mesocycle
const B_MESO = "d0000000-0000-0000-0000-000000000002"; // Bob's mesocycle
const B_SNAP = "e0000000-0000-0000-0000-000000000002"; // Bob's snapshot

const A_ASSESS = "a0000000-0000-0000-0000-000000000001"; // Alice's assessment
const B_ASSESS = "a0000000-0000-0000-0000-000000000002"; // Bob's assessment
const TEMPLATE = "c0000000-0000-0000-0000-000000000001";

/** Full INSERT for strength_mesocycles — covers every NOT NULL column. */
const insertMeso = (athleteId: number) =>
  `INSERT INTO strength_mesocycles
     (athlete_id, assessment_id, template_id, event_group, kind,
      target_week_count, sessions_per_week, engine_version)
   VALUES (${athleteId}, '${A_ASSESS}', '${TEMPLATE}', 'sprint',
           'season', 8, 3, '1.0.0')`;

beforeAll(async () => {
  await resetDb();
  // Fixtures inserted here (not in seed.sql): a seeded mesocycle FK-pins the
  // periodization template, which would break the template-delete tests.
  await asServiceRole(async (c) => {
    await c.query(
      `INSERT INTO strength_mesocycles
         (id, athlete_id, assessment_id, template_id, event_group, kind,
          target_week_count, sessions_per_week, engine_version) VALUES
       ($1, 1, $3, $5, 'sprint', 'season', 8, 3, '1.0.0'),
       ($2, 2, $4, $5, 'sprint', 'season', 8, 3, '1.0.0')`,
      [A_MESO, B_MESO, A_ASSESS, B_ASSESS, TEMPLATE],
    );
    await c.query(
      `INSERT INTO strength_planning_snapshots (id, mesocycle_id, athlete_id)
       VALUES ($1, $2, 2)`,
      [B_SNAP, B_MESO],
    );
  });
});

describe("strength_mesocycles RLS", () => {
  it("Alice sees only her own mesocycle", async () => {
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string }>(
        "SELECT id FROM strength_mesocycles ORDER BY id",
      );
      return r.rows;
    });
    expect(rows.map((r) => r.id)).toEqual([A_MESO]);
  });

  it("Alice does NOT see Bob's mesocycle", async () => {
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string }>(
        "SELECT id FROM strength_mesocycles WHERE id = $1",
        [B_MESO],
      );
      return r.rows;
    });
    expect(rows).toEqual([]);
  });

  it("Alice CAN insert a mesocycle for herself", async () => {
    const inserted = await asUser(ALICE, async (c) => {
      const r = await c.query<{ athlete_id: number }>(
        insertMeso(1) + " RETURNING athlete_id",
      );
      return r.rows;
    });
    expect(inserted).toEqual([{ athlete_id: 1 }]);
  });

  it("Alice CANNOT insert a mesocycle for Bob (WITH CHECK blocks it)", async () => {
    await expect(
      asUser(ALICE, async (c) => {
        await c.query(insertMeso(2));
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it("Alice CAN update her own mesocycle", async () => {
    const updated = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string; status: string }>(
        "UPDATE strength_mesocycles SET status = 'superseded' WHERE id = $1 RETURNING id, status",
        [A_MESO],
      );
      return r.rows;
    });
    expect(updated).toEqual([{ id: A_MESO, status: "superseded" }]);
  });

  it("Alice CANNOT update Bob's mesocycle (filtered, 0 rows)", async () => {
    const updated = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string }>(
        "UPDATE strength_mesocycles SET status = 'reverted' WHERE id = $1 RETURNING id",
        [B_MESO],
      );
      return r.rows;
    });
    expect(updated).toEqual([]);
  });

  it("coach sees every swimmer's mesocycle", async () => {
    const rows = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string }>(
        "SELECT id FROM strength_mesocycles ORDER BY id",
      );
      return r.rows;
    });
    expect(rows.map((r) => r.id)).toEqual([A_MESO, B_MESO]);
  });

  it("coach CAN revert any swimmer's mesocycle", async () => {
    const updated = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string; status: string }>(
        "UPDATE strength_mesocycles SET status = 'reverted' WHERE id = $1 RETURNING id, status",
        [A_MESO],
      );
      return r.rows;
    });
    expect(updated).toEqual([{ id: A_MESO, status: "reverted" }]);
  });

  it("admin CAN revert any swimmer's mesocycle", async () => {
    const updated = await asUser(DIANA, async (c) => {
      const r = await c.query<{ id: string }>(
        "UPDATE strength_mesocycles SET status = 'reverted' WHERE id = $1 RETURNING id",
        [B_MESO],
      );
      return r.rows;
    });
    expect(updated).toEqual([{ id: B_MESO }]);
  });
});

describe("strength_planning_snapshots RLS", () => {
  it("Alice does NOT see Bob's snapshot", async () => {
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string }>(
        "SELECT id FROM strength_planning_snapshots WHERE id = $1",
        [B_SNAP],
      );
      return r.rows;
    });
    expect(rows).toEqual([]);
  });

  it("Alice CAN insert a snapshot for her own mesocycle", async () => {
    const inserted = await asUser(ALICE, async (c) => {
      const r = await c.query<{ athlete_id: number }>(
        `INSERT INTO strength_planning_snapshots (mesocycle_id, athlete_id)
         VALUES ($1, 1) RETURNING athlete_id`,
        [A_MESO],
      );
      return r.rows;
    });
    expect(inserted).toEqual([{ athlete_id: 1 }]);
  });

  it("Alice CANNOT insert a snapshot for Bob (WITH CHECK blocks it)", async () => {
    await expect(
      asUser(ALICE, async (c) => {
        await c.query(
          `INSERT INTO strength_planning_snapshots (mesocycle_id, athlete_id)
           VALUES ($1, 2)`,
          [B_MESO],
        );
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it("coach sees every swimmer's snapshot", async () => {
    const rows = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string }>(
        "SELECT id FROM strength_planning_snapshots ORDER BY id",
      );
      return r.rows;
    });
    expect(rows.map((r) => r.id)).toEqual([B_SNAP]);
  });
});
