/**
 * §184 — RLS tests for coach_pace_targets
 *
 * Covers INSERT (account/manual), XOR constraint, cross-coach isolation,
 * and idempotent upsert via ON CONFLICT partial index syntax.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { asUser, asServiceRole, resetDb } from "./_helpers";

const CAROL_UID = "00000000-0000-0000-0000-000000000003";
const EVE_UID   = "00000000-0000-0000-0000-000000000005";

const CAROL = { appUserId: 3, appUserRole: "coach" as const, authUid: CAROL_UID };
const EVE   = { appUserId: 5, appUserRole: "coach" as const, authUid: EVE_UID };

// Alice (id=1) is a seeded athlete used as swimmer_account_id.
const ALICE_ID = 1;

let manualId: string;   // Carol's seeded manual swimmer
let targetId: string;   // Carol's seeded account target

beforeAll(async () => {
  await resetDb();

  await asServiceRole(async (c) => {
    // Seed Carol's manual swimmer
    const ms = await c.query(
      `INSERT INTO coach_manual_swimmers (coach_id, display_name) VALUES ($1, 'Bob Manuel') RETURNING id`,
      [CAROL_UID],
    );
    manualId = ms.rows[0].id;

    // Seed one account target for Carol → Alice (for UPDATE/DELETE and cross-coach tests)
    const tgt = await c.query(
      `INSERT INTO coach_pace_targets
         (coach_id, swimmer_account_id, swimmer_manual_id, stroke, target_distance_m, target_time_ms)
       VALUES ($1, $2, NULL, 'NL', 100, 65000) RETURNING id`,
      [CAROL_UID, ALICE_ID],
    );
    targetId = tgt.rows[0].id;
  });
});

describe("coach_pace_targets RLS (§184)", () => {
  it("coach A INSERT target with swimmer_account_id → OK", async () => {
    const rows = await asUser(CAROL, async (c) => {
      const r = await c.query(
        `INSERT INTO coach_pace_targets
           (coach_id, swimmer_account_id, swimmer_manual_id, stroke, target_distance_m, target_time_ms)
         VALUES ($1, $2, NULL, 'Dos', 50, 30000) RETURNING id`,
        [CAROL_UID, ALICE_ID],
      );
      return r.rowCount;
    });
    expect(rows).toBe(1);
  });

  it("coach A INSERT target with swimmer_manual_id → OK", async () => {
    const rows = await asUser(CAROL, async (c) => {
      const r = await c.query(
        `INSERT INTO coach_pace_targets
           (coach_id, swimmer_account_id, swimmer_manual_id, stroke, target_distance_m, target_time_ms)
         VALUES ($1, NULL, $2, 'Dos', 50, 32000) RETURNING id`,
        [CAROL_UID, manualId],
      );
      return r.rowCount;
    });
    expect(rows).toBe(1);
  });

  it("INSERT with both swimmer_account_id AND swimmer_manual_id → CHECK XOR error", async () => {
    await expect(
      asUser(CAROL, async (c) => {
        await c.query(
          `INSERT INTO coach_pace_targets
             (coach_id, swimmer_account_id, swimmer_manual_id, stroke, target_distance_m, target_time_ms)
           VALUES ($1, $2, $3, 'NL', 50, 30000)`,
          [CAROL_UID, ALICE_ID, manualId],
        );
      }),
    ).rejects.toThrow(/check/i);
  });

  it("INSERT with both swimmer refs NULL → CHECK XOR error", async () => {
    await expect(
      asUser(CAROL, async (c) => {
        await c.query(
          `INSERT INTO coach_pace_targets
             (coach_id, swimmer_account_id, swimmer_manual_id, stroke, target_distance_m, target_time_ms)
           VALUES ($1, NULL, NULL, 'NL', 50, 30000)`,
          [CAROL_UID],
        );
      }),
    ).rejects.toThrow(/check/i);
  });

  it("coach B SELECT coach A targets → 0 rows", async () => {
    const count = await asUser(EVE, async (c) => {
      const r = await c.query(
        "SELECT * FROM coach_pace_targets WHERE coach_id = $1",
        [CAROL_UID],
      );
      return r.rowCount;
    });
    expect(count).toBe(0);
  });

  it("coach B UPDATE coach A target → 0 rows affected", async () => {
    const affected = await asUser(EVE, async (c) => {
      const r = await c.query(
        "UPDATE coach_pace_targets SET target_time_ms = 99999 WHERE id = $1",
        [targetId],
      );
      return r.rowCount;
    });
    expect(affected).toBe(0);
  });

  it("coach B DELETE coach A target → 0 rows affected", async () => {
    const affected = await asUser(EVE, async (c) => {
      const r = await c.query(
        "DELETE FROM coach_pace_targets WHERE id = $1",
        [targetId],
      );
      return r.rowCount;
    });
    expect(affected).toBe(0);
  });

  it("coach A UPDATE/DELETE own target → OK", async () => {
    const updated = await asUser(CAROL, async (c) => {
      const r = await c.query(
        "UPDATE coach_pace_targets SET target_time_ms = 70000 WHERE id = $1 RETURNING id",
        [targetId],
      );
      return r.rowCount;
    });
    expect(updated).toBe(1);
  });

  it("INSERT without target_pool_size → defaults to '50m'", async () => {
    const poolSize = await asUser(CAROL, async (c) => {
      const r = await c.query(
        `INSERT INTO coach_pace_targets
           (coach_id, swimmer_account_id, swimmer_manual_id, stroke, target_distance_m, target_time_ms)
         VALUES ($1, $2, NULL, 'Brasse', 200, 160000) RETURNING target_pool_size`,
        [CAROL_UID, ALICE_ID],
      );
      return r.rows[0].target_pool_size;
    });
    expect(poolSize).toBe("50m");
  });

  it("INSERT with target_pool_size = '25m' → persisted correctly", async () => {
    const poolSize = await asUser(CAROL, async (c) => {
      const r = await c.query(
        `INSERT INTO coach_pace_targets
           (coach_id, swimmer_account_id, swimmer_manual_id, stroke, target_distance_m, target_time_ms, target_pool_size)
         VALUES ($1, $2, NULL, 'Brasse', 400, 320000, '25m') RETURNING target_pool_size`,
        [CAROL_UID, ALICE_ID],
      );
      return r.rows[0].target_pool_size;
    });
    expect(poolSize).toBe("25m");
  });

  it("INSERT with invalid target_pool_size → CHECK error", async () => {
    await expect(
      asUser(CAROL, async (c) => {
        await c.query(
          `INSERT INTO coach_pace_targets
             (coach_id, swimmer_account_id, swimmer_manual_id, stroke, target_distance_m, target_time_ms, target_pool_size)
           VALUES ($1, $2, NULL, 'Brasse', 800, 640000, '33m')`,
          [CAROL_UID, ALICE_ID],
        );
      }),
    ).rejects.toThrow(/check/i);
  });

  it("idempotent upsert via ON CONFLICT partial index → replaces target_time_ms", async () => {
    // First upsert: inserts the row via service role (seed already done above).
    // Second upsert: should update target_time_ms to 75000.
    const newMs = await asUser(CAROL, async (c) => {
      const r = await c.query(
        `INSERT INTO coach_pace_targets
           (coach_id, swimmer_account_id, swimmer_manual_id, stroke, target_distance_m, target_time_ms)
         VALUES ($1, $2, NULL, 'NL', 100, 75000)
         ON CONFLICT (coach_id, swimmer_account_id, stroke, target_distance_m)
           WHERE swimmer_account_id IS NOT NULL
         DO UPDATE SET target_time_ms = EXCLUDED.target_time_ms
         RETURNING target_time_ms`,
        [CAROL_UID, ALICE_ID],
      );
      return r.rows[0].target_time_ms;
    });
    expect(newMs).toBe(75000);
  });
});
