/**
 * RLS: public.strength_assessments + public.strength_kpi_measurements (§285)
 *
 * Chantier B "Bilan Muscu → Mésocycle". Both tables follow the same pattern:
 *   - `_own`   policy : athlete owns rows where athlete_id = app_user_id()
 *   - `_coach` policy : coach/admin get FULL access (FOR ALL) to any athlete's
 *                       rows — the coach renseigne physical_tests + valide les
 *                       mesures KPI (coach_reviewed). No per-athlete scoping.
 *
 * Invariants tested:
 *   - A swimmer reads/writes ONLY his own assessments + KPI measurements.
 *   - A swimmer does NOT see another swimmer's assessment.
 *   - A coach reads AND writes any swimmer's rows.
 *   - A coach can flip `coach_reviewed` to true on a swimmer's measurement.
 *
 * Fixtures (seed.sql):
 *   strength_assessments      : a1 (Alice), a2 (Bob)
 *   strength_kpi_measurements : km1 (Alice), km2 (Bob)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { asUser, asServiceRole, resetDb } from "./_helpers";

const ALICE = { appUserId: 1, appUserRole: "athlete" as const };
const BOB = { appUserId: 2, appUserRole: "athlete" as const };
const CAROL = { appUserId: 3, appUserRole: "coach" as const };
const DIANA = { appUserId: 4, appUserRole: "admin" as const };

// Deterministic seed UUIDs — last segment encodes the owning athlete id.
const A_ASSESS = "a0000000-0000-0000-0000-000000000001"; // Alice's assessment
const B_ASSESS = "a0000000-0000-0000-0000-000000000002"; // Bob's assessment
const A_KPI = "b0000000-0000-0000-0000-000000000001"; // Alice's measurement
const B_KPI = "b0000000-0000-0000-0000-000000000002"; // Bob's measurement

beforeAll(async () => {
  await resetDb();
});

describe("strength_assessments RLS", () => {
  it("Alice sees only her own assessment", async () => {
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string }>(
        "SELECT id FROM strength_assessments ORDER BY id",
      );
      return r.rows;
    });
    expect(rows.map((r) => r.id)).toEqual([A_ASSESS]);
  });

  it("Alice does NOT see Bob's assessment", async () => {
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string }>(
        "SELECT id FROM strength_assessments WHERE id = $1",
        [B_ASSESS],
      );
      return r.rows;
    });
    expect(rows).toEqual([]);
  });

  it("Alice CAN insert an assessment for herself", async () => {
    const inserted = await asUser(ALICE, async (c) => {
      const r = await c.query<{ athlete_id: number }>(
        "INSERT INTO strength_assessments (athlete_id) VALUES (1) RETURNING athlete_id",
      );
      return r.rows;
    });
    expect(inserted).toEqual([{ athlete_id: 1 }]);
  });

  it("Alice CANNOT insert an assessment for Bob (WITH CHECK blocks it)", async () => {
    await expect(
      asUser(ALICE, async (c) => {
        await c.query(
          "INSERT INTO strength_assessments (athlete_id) VALUES (2)",
        );
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it("Alice CAN update her own assessment", async () => {
    const updated = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string; status: string }>(
        "UPDATE strength_assessments SET status = 'bilan_pending' WHERE id = $1 RETURNING id, status",
        [A_ASSESS],
      );
      return r.rows;
    });
    expect(updated).toEqual([{ id: A_ASSESS, status: "bilan_pending" }]);
  });

  it("Alice CANNOT update Bob's assessment (filtered, 0 rows)", async () => {
    const updated = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string }>(
        "UPDATE strength_assessments SET status = 'completed' WHERE id = $1 RETURNING id",
        [B_ASSESS],
      );
      return r.rows;
    });
    expect(updated).toEqual([]);
  });

  it("coach sees every swimmer's assessment", async () => {
    const rows = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string }>(
        "SELECT id FROM strength_assessments ORDER BY id",
      );
      return r.rows;
    });
    expect(rows.map((r) => r.id)).toEqual([A_ASSESS, B_ASSESS]);
  });

  it("coach CAN write (update) any swimmer's assessment", async () => {
    const updated = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string; status: string }>(
        "UPDATE strength_assessments SET status = 'completed' WHERE id = $1 RETURNING id, status",
        [A_ASSESS],
      );
      return r.rows;
    });
    expect(updated).toEqual([{ id: A_ASSESS, status: "completed" }]);
  });

  it("coach CAN insert an assessment for any swimmer", async () => {
    const inserted = await asUser(CAROL, async (c) => {
      const r = await c.query<{ athlete_id: number }>(
        "INSERT INTO strength_assessments (athlete_id, coach_id) VALUES (2, 3) RETURNING athlete_id",
      );
      return r.rows;
    });
    expect(inserted).toEqual([{ athlete_id: 2 }]);
  });

  it("admin CAN write any swimmer's assessment", async () => {
    const updated = await asUser(DIANA, async (c) => {
      const r = await c.query<{ id: string }>(
        "UPDATE strength_assessments SET status = 'completed' WHERE id = $1 RETURNING id",
        [B_ASSESS],
      );
      return r.rows;
    });
    expect(updated).toEqual([{ id: B_ASSESS }]);
  });
});

describe("strength_kpi_measurements RLS", () => {
  it("Alice sees only her own KPI measurement", async () => {
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string }>(
        "SELECT id FROM strength_kpi_measurements ORDER BY id",
      );
      return r.rows;
    });
    expect(rows.map((r) => r.id)).toEqual([A_KPI]);
  });

  it("Alice does NOT see Bob's KPI measurement", async () => {
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string }>(
        "SELECT id FROM strength_kpi_measurements WHERE id = $1",
        [B_KPI],
      );
      return r.rows;
    });
    expect(rows).toEqual([]);
  });

  it("Alice CAN insert a measurement for herself", async () => {
    const inserted = await asUser(ALICE, async (c) => {
      const r = await c.query<{ athlete_id: number }>(
        `INSERT INTO strength_kpi_measurements
           (athlete_id, kpi_key, value, unit, source)
         VALUES (1, 'broad_jump', 210, 'cm', 'wizard_athlete')
         RETURNING athlete_id`,
      );
      return r.rows;
    });
    expect(inserted).toEqual([{ athlete_id: 1 }]);
  });

  it("Alice CANNOT insert a measurement for Bob (WITH CHECK blocks it)", async () => {
    await expect(
      asUser(ALICE, async (c) => {
        await c.query(
          `INSERT INTO strength_kpi_measurements
             (athlete_id, kpi_key, value, unit, source)
           VALUES (2, 'broad_jump', 200, 'cm', 'wizard_athlete')`,
        );
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it("Alice CANNOT update Bob's measurement (filtered, 0 rows)", async () => {
    const updated = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string }>(
        "UPDATE strength_kpi_measurements SET value = 99 WHERE id = $1 RETURNING id",
        [B_KPI],
      );
      return r.rows;
    });
    expect(updated).toEqual([]);
  });

  it("coach sees every swimmer's KPI measurement", async () => {
    const rows = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string }>(
        "SELECT id FROM strength_kpi_measurements ORDER BY id",
      );
      return r.rows;
    });
    expect(rows.map((r) => r.id)).toEqual([A_KPI, B_KPI]);
  });

  it("coach CAN insert a measurement for any swimmer (wizard_coach)", async () => {
    const inserted = await asUser(CAROL, async (c) => {
      const r = await c.query<{ athlete_id: number; source: string }>(
        `INSERT INTO strength_kpi_measurements
           (athlete_id, kpi_key, value, unit, source, measured_by)
         VALUES (1, 'imtp', 1800, 'N', 'wizard_coach', 3)
         RETURNING athlete_id, source`,
      );
      return r.rows;
    });
    expect(inserted).toEqual([{ athlete_id: 1, source: "wizard_coach" }]);
  });

  it("coach CAN flip coach_reviewed to true on a swimmer's measurement", async () => {
    const updated = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string; coach_reviewed: boolean }>(
        "UPDATE strength_kpi_measurements SET coach_reviewed = true WHERE id = $1 RETURNING id, coach_reviewed",
        [A_KPI],
      );
      return r.rows;
    });
    expect(updated).toEqual([{ id: A_KPI, coach_reviewed: true }]);
  });

  it("admin CAN flip coach_reviewed to true on a swimmer's measurement", async () => {
    const updated = await asUser(DIANA, async (c) => {
      const r = await c.query<{ id: string; coach_reviewed: boolean }>(
        "UPDATE strength_kpi_measurements SET coach_reviewed = true WHERE id = $1 RETURNING id, coach_reviewed",
        [B_KPI],
      );
      return r.rows;
    });
    expect(updated).toEqual([{ id: B_KPI, coach_reviewed: true }]);
  });

  it("athlete coach_reviewed flip on own row is rolled back (transaction isolation sanity)", async () => {
    // Bob flips his own row inside asUser → ROLLBACK afterward.
    await asUser(BOB, async (c) => {
      await c.query(
        "UPDATE strength_kpi_measurements SET coach_reviewed = true WHERE id = $1",
        [B_KPI],
      );
    });
    // Service role confirms the seed value is untouched (rollback worked).
    const persisted = await asServiceRole(async (c) => {
      const r = await c.query<{ coach_reviewed: boolean }>(
        "SELECT coach_reviewed FROM strength_kpi_measurements WHERE id = $1",
        [B_KPI],
      );
      return r.rows;
    });
    expect(persisted).toEqual([{ coach_reviewed: false }]);
  });
});
