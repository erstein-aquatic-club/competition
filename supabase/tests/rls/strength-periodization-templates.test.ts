/**
 * RLS: public.strength_periodization_templates (§292)
 *
 * Chantier A "Bilan Muscu → Mésocycle". Référentiel des templates de
 * périodisation. Two policies only:
 *   - `spt_select` : FOR SELECT TO authenticated USING (true)
 *                    → any authenticated user reads the whole referential.
 *   - `spt_write`  : FOR ALL TO authenticated, USING/WITH CHECK
 *                    app_user_role() IN ('coach','admin')
 *                    → only coach/admin may INSERT/UPDATE/DELETE.
 *
 * Unlike strength_assessments there is NO per-athlete `_own` write policy:
 * a swimmer has read-only access to this referential.
 *
 * Invariants tested:
 *   - A swimmer (athlete) CAN SELECT every row.
 *   - A swimmer CANNOT INSERT (WITH CHECK exception — no permissive write
 *     policy passes for an athlete).
 *   - A swimmer CANNOT UPDATE/DELETE — silently filtered to 0 rows (the write
 *     path's USING clause excludes athletes).
 *   - A coach CAN INSERT / UPDATE / DELETE.
 *   - An admin CAN INSERT / UPDATE / DELETE.
 *
 * Fixtures (seed.sql):
 *   strength_periodization_templates : tpl1 (Sprint 8 semaines)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { asUser, asServiceRole, resetDb } from "./_helpers";

const ALICE = { appUserId: 1, appUserRole: "athlete" as const };
const CAROL = { appUserId: 3, appUserRole: "coach" as const };
const DIANA = { appUserId: 4, appUserRole: "admin" as const };

// Seeded template — deterministic UUID.
const TPL1 = "c0000000-0000-0000-0000-000000000001";

beforeAll(async () => {
  await resetDb();
});

describe("strength_periodization_templates RLS", () => {
  // ── SELECT — world-readable to any authenticated user ─────────────────────
  it("a swimmer CAN SELECT every template (referential is world-readable)", async () => {
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string; name: string }>(
        "SELECT id, name FROM strength_periodization_templates ORDER BY id",
      );
      return r.rows;
    });
    expect(rows).toEqual([{ id: TPL1, name: "Sprint 8 semaines" }]);
  });

  // ── A swimmer CANNOT write ────────────────────────────────────────────────
  it("a swimmer CANNOT INSERT a template (WITH CHECK blocks it)", async () => {
    await expect(
      asUser(ALICE, async (c) => {
        await c.query(
          `INSERT INTO strength_periodization_templates
             (event_group, name, week_count, structure)
           VALUES ('sprint', 'Athlete sneak-in', 6, '{"weeks": []}'::jsonb)`,
        );
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it("a swimmer CANNOT UPDATE a template (filtered, 0 rows)", async () => {
    const updated = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string }>(
        "UPDATE strength_periodization_templates SET name = 'hacked' WHERE id = $1 RETURNING id",
        [TPL1],
      );
      return r.rows;
    });
    expect(updated).toEqual([]);
  });

  it("a swimmer CANNOT DELETE a template (filtered, 0 rows)", async () => {
    const deleted = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string }>(
        "DELETE FROM strength_periodization_templates WHERE id = $1 RETURNING id",
        [TPL1],
      );
      return r.rows;
    });
    expect(deleted).toEqual([]);
    // Service role confirms the row is still there (the no-op DELETE changed nothing).
    const persisted = await asServiceRole(async (c) => {
      const r = await c.query<{ id: string }>(
        "SELECT id FROM strength_periodization_templates WHERE id = $1",
        [TPL1],
      );
      return r.rows;
    });
    expect(persisted).toEqual([{ id: TPL1 }]);
  });

  // ── A coach CAN write ─────────────────────────────────────────────────────
  it("a coach CAN INSERT a template", async () => {
    const inserted = await asUser(CAROL, async (c) => {
      const r = await c.query<{ name: string; week_count: number }>(
        `INSERT INTO strength_periodization_templates
           (event_group, name, week_count, structure)
         VALUES ('endurance', 'Coach template', 12, '{"weeks": []}'::jsonb)
         RETURNING name, week_count`,
      );
      return r.rows;
    });
    expect(inserted).toEqual([{ name: "Coach template", week_count: 12 }]);
  });

  it("a coach CAN UPDATE a template", async () => {
    const updated = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string; name: string }>(
        "UPDATE strength_periodization_templates SET name = 'Sprint révisé' WHERE id = $1 RETURNING id, name",
        [TPL1],
      );
      return r.rows;
    });
    expect(updated).toEqual([{ id: TPL1, name: "Sprint révisé" }]);
  });

  it("a coach CAN DELETE a template", async () => {
    const deleted = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string }>(
        "DELETE FROM strength_periodization_templates WHERE id = $1 RETURNING id",
        [TPL1],
      );
      return r.rows;
    });
    expect(deleted).toEqual([{ id: TPL1 }]);
  });

  // ── An admin CAN write too ────────────────────────────────────────────────
  it("an admin CAN INSERT a template", async () => {
    const inserted = await asUser(DIANA, async (c) => {
      const r = await c.query<{ name: string }>(
        `INSERT INTO strength_periodization_templates
           (event_group, name, week_count, structure)
         VALUES ('mixte', 'Admin template', 10, '{"weeks": []}'::jsonb)
         RETURNING name`,
      );
      return r.rows;
    });
    expect(inserted).toEqual([{ name: "Admin template" }]);
  });

  it("an admin CAN UPDATE a template", async () => {
    const updated = await asUser(DIANA, async (c) => {
      const r = await c.query<{ id: string; week_count: number }>(
        "UPDATE strength_periodization_templates SET week_count = 16 WHERE id = $1 RETURNING id, week_count",
        [TPL1],
      );
      return r.rows;
    });
    expect(updated).toEqual([{ id: TPL1, week_count: 16 }]);
  });

  it("an admin CAN DELETE a template", async () => {
    const deleted = await asUser(DIANA, async (c) => {
      const r = await c.query<{ id: string }>(
        "DELETE FROM strength_periodization_templates WHERE id = $1 RETURNING id",
        [TPL1],
      );
      return r.rows;
    });
    expect(deleted).toEqual([{ id: TPL1 }]);
  });
});
