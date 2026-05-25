/**
 * RLS: public.strength_athlete_settings (Task 5 — déjeunification G1-G3)
 *
 * "Niveau de pratique + palier de performance" renseignés PAR LE COACH, lus par
 * le nageur pour calibrer son barème KPI. Contrairement à strength_assessments,
 * la RLS est ASYMÉTRIQUE :
 *
 *   - `_own_read` (FOR SELECT) : le nageur LIT SEULEMENT sa propre ligne.
 *     Il n'y a AUCUNE policy d'écriture athlète → un nageur ne peut PAS
 *     INSERT/UPDATE ses propres réglages (c'est une décision coach).
 *   - `_coach`    (FOR ALL)    : coach/admin lisent ET écrivent toute ligne
 *                                du club, sans scoping par-athlète.
 *
 * Invariants tested:
 *   1. Un nageur peut SELECT sa propre ligne.
 *   2. Un nageur ne peut PAS SELECT la ligne d'un autre nageur (0 rows, pas erreur).
 *   3. Un nageur ne peut PAS INSERT/UPDATE sa propre ligne (write bloqué par RLS).
 *   4. Un coach peut SELECT + UPSERT n'importe quelle ligne (admin aussi).
 *
 * Fixtures (seed.sql):
 *   strength_athlete_settings : athlete_id=1 (Alice), athlete_id=2 (Bob)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { asUser, asServiceRole, resetDb } from "./_helpers";

const ALICE = { appUserId: 1, appUserRole: "athlete" as const };
const BOB = { appUserId: 2, appUserRole: "athlete" as const };
const CAROL = { appUserId: 3, appUserRole: "coach" as const };
const DIANA = { appUserId: 4, appUserRole: "admin" as const };

beforeAll(async () => {
  await resetDb();
});

describe("strength_athlete_settings RLS", () => {
  // ─── Cas 1 : athlète lit SA ligne ──────────────────────────────────────────
  it("Alice CAN read her own settings row", async () => {
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<{
        athlete_id: number;
        practice_level: string;
        performance_tier: string;
      }>(
        "SELECT athlete_id, practice_level, performance_tier FROM strength_athlete_settings ORDER BY athlete_id",
      );
      return r.rows;
    });
    expect(rows).toEqual([
      { athlete_id: 1, practice_level: "intermediate", performance_tier: "regional" },
    ]);
  });

  // ─── Cas 2 : athlète NE lit PAS la ligne d'un autre (0 rows, pas erreur) ─────
  it("Alice CANNOT read Bob's settings row (filtered, 0 rows)", async () => {
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<{ athlete_id: number }>(
        "SELECT athlete_id FROM strength_athlete_settings WHERE athlete_id = 2",
      );
      return r.rows;
    });
    expect(rows).toEqual([]);
  });

  // ─── Cas 3 : athlète NE peut PAS écrire (aucune policy d'écriture athlète) ───
  it("Alice CANNOT insert a settings row for herself (no own-write policy)", async () => {
    await expect(
      asUser(ALICE, async (c) => {
        await c.query(
          `INSERT INTO strength_athlete_settings (athlete_id, practice_level, performance_tier)
           VALUES (1, 'advanced', 'elite')`,
        );
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it("Alice CANNOT update her own settings row (filtered, 0 rows)", async () => {
    // No own-write policy → the row is invisible to UPDATE's USING clause,
    // so it matches 0 rows rather than raising (the §113 silent-no-op shape).
    const updated = await asUser(ALICE, async (c) => {
      const r = await c.query<{ athlete_id: number }>(
        "UPDATE strength_athlete_settings SET practice_level = 'advanced' WHERE athlete_id = 1 RETURNING athlete_id",
      );
      return r.rows;
    });
    expect(updated).toEqual([]);
    // Confirm the seed value is untouched on disk.
    const persisted = await asServiceRole(async (c) => {
      const r = await c.query<{ practice_level: string }>(
        "SELECT practice_level FROM strength_athlete_settings WHERE athlete_id = 1",
      );
      return r.rows;
    });
    expect(persisted).toEqual([{ practice_level: "intermediate" }]);
  });

  // ─── Cas 4 : coach lit + écrit toute ligne du club ──────────────────────────
  it("coach sees every athlete's settings row", async () => {
    const rows = await asUser(CAROL, async (c) => {
      const r = await c.query<{ athlete_id: number }>(
        "SELECT athlete_id FROM strength_athlete_settings ORDER BY athlete_id",
      );
      return r.rows;
    });
    expect(rows.map((r) => r.athlete_id)).toEqual([1, 2]);
  });

  it("coach CAN update any athlete's settings row", async () => {
    const updated = await asUser(CAROL, async (c) => {
      const r = await c.query<{ athlete_id: number; practice_level: string }>(
        "UPDATE strength_athlete_settings SET practice_level = 'advanced' WHERE athlete_id = 1 RETURNING athlete_id, practice_level",
      );
      return r.rows;
    });
    expect(updated).toEqual([{ athlete_id: 1, practice_level: "advanced" }]);
  });

  it("coach CAN upsert a settings row for an athlete without one", async () => {
    // Eve (coach, id=5) has no settings row in the seed — coach creates it.
    const upserted = await asUser(CAROL, async (c) => {
      const r = await c.query<{ athlete_id: number; performance_tier: string }>(
        `INSERT INTO strength_athlete_settings (athlete_id, practice_level, performance_tier, updated_by)
         VALUES (5, 'beginner', 'club', 3)
         ON CONFLICT (athlete_id) DO UPDATE SET performance_tier = EXCLUDED.performance_tier
         RETURNING athlete_id, performance_tier`,
      );
      return r.rows;
    });
    expect(upserted).toEqual([{ athlete_id: 5, performance_tier: "club" }]);
  });

  it("admin CAN update any athlete's settings row", async () => {
    const updated = await asUser(DIANA, async (c) => {
      const r = await c.query<{ athlete_id: number; performance_tier: string }>(
        "UPDATE strength_athlete_settings SET performance_tier = 'national' WHERE athlete_id = 2 RETURNING athlete_id, performance_tier",
      );
      return r.rows;
    });
    expect(updated).toEqual([{ athlete_id: 2, performance_tier: "national" }]);
  });

  it("Bob CAN read his own settings but NOT Alice's", async () => {
    const rows = await asUser(BOB, async (c) => {
      const r = await c.query<{ athlete_id: number }>(
        "SELECT athlete_id FROM strength_athlete_settings ORDER BY athlete_id",
      );
      return r.rows;
    });
    expect(rows.map((r) => r.athlete_id)).toEqual([2]);
  });
});
