/**
 * RLS: public.competition_checklists + public.competition_checklist_checks
 *
 * Parent-child: checks → checklists → competitions.
 * Key asymmetries:
 *   - checklists: athlete can SELECT/INSERT/DELETE own, coach can only SELECT
 *   - checks: athlete can SELECT/INSERT/UPDATE via parent ownership, coach can only SELECT
 *   - This means the checklist is athlete-owned: the coach can observe but not modify.
 *
 * Fixtures (seed.sql):
 *   Checklists: cl1 (Alice), cl2 (Bob) — both for "Meeting Printemps"
 *   Checks: ck1+ck2 in cl1 (Alice owns), ck3 in cl2 (Bob owns)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { asUser, resetDb } from "./_helpers";

const ALICE = { appUserId: 1, appUserRole: "athlete" as const };
const BOB = { appUserId: 2, appUserRole: "athlete" as const };
const CAROL = { appUserId: 3, appUserRole: "coach" as const };

const CL1 = "30000000-0000-0000-0000-000000000001"; // Alice's checklist
const CL2 = "30000000-0000-0000-0000-000000000002"; // Bob's checklist
const CK1 = "50000000-0000-0000-0000-000000000001"; // check in Alice's CL
const CK2 = "50000000-0000-0000-0000-000000000002"; // check in Alice's CL
const CK3 = "50000000-0000-0000-0000-000000000003"; // check in Bob's CL

beforeAll(async () => {
  await resetDb();
});

describe("competition_checklists RLS", () => {
  it("Alice sees only her own checklist", async () => {
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string }>("SELECT id FROM competition_checklists ORDER BY id");
      return r.rows;
    });
    expect(rows.map((r) => r.id)).toEqual([CL1]);
  });

  it("coach sees all checklists (read-only access for observing)", async () => {
    const rows = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string }>("SELECT id FROM competition_checklists ORDER BY id");
      return r.rows;
    });
    expect(rows).toHaveLength(2);
  });

  it("coach CANNOT insert a checklist (athlete-only)", async () => {
    await expect(
      asUser(CAROL, async (c) => {
        await c.query(
          `INSERT INTO competition_checklists (competition_id, athlete_id, checklist_template_id)
           VALUES ('20000000-0000-0000-0000-000000000001', 1, '40000000-0000-0000-0000-000000000001')`,
        );
      }),
    ).rejects.toThrow(/row-level security|new row violates/);
  });

  it("coach CANNOT delete a checklist (athlete-only)", async () => {
    const deleted = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string }>(
        "DELETE FROM competition_checklists WHERE id = $1 RETURNING id",
        [CL1],
      );
      return r.rows;
    });
    expect(deleted).toEqual([]);
  });
});

describe("competition_checklist_checks RLS (EXISTS on parent checklist)", () => {
  it("Alice sees checks from her own checklist (ck1, ck2)", async () => {
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string }>("SELECT id FROM competition_checklist_checks ORDER BY id");
      return r.rows;
    });
    expect(rows.map((r) => r.id)).toEqual([CK1, CK2]);
  });

  it("Alice does NOT see Bob's checks (ck3)", async () => {
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string }>(
        "SELECT id FROM competition_checklist_checks WHERE id = $1",
        [CK3],
      );
      return r.rows;
    });
    expect(rows).toEqual([]);
  });

  it("coach sees all checks", async () => {
    const rows = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string }>("SELECT id FROM competition_checklist_checks ORDER BY id");
      return r.rows;
    });
    expect(rows).toHaveLength(3);
  });

  it("Alice CAN toggle her own check", async () => {
    const updated = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string; checked: boolean }>(
        "UPDATE competition_checklist_checks SET checked = true WHERE id = $1 RETURNING id, checked",
        [CK1],
      );
      return r.rows;
    });
    expect(updated).toEqual([{ id: CK1, checked: true }]);
  });

  it("Alice CANNOT toggle Bob's check", async () => {
    const updated = await asUser(ALICE, async (c) => {
      const r = await c.query<{ id: string }>(
        "UPDATE competition_checklist_checks SET checked = true WHERE id = $1 RETURNING id",
        [CK3],
      );
      return r.rows;
    });
    expect(updated).toEqual([]);
  });

  it("coach CANNOT toggle any check (athlete-only mutation)", async () => {
    const updated = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: string }>(
        "UPDATE competition_checklist_checks SET checked = true WHERE id = $1 RETURNING id",
        [CK1],
      );
      return r.rows;
    });
    expect(updated).toEqual([]);
  });
});
