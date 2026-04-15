/**
 * RLS: public.interviews
 *
 * Coverage for the interviews workflow (chantier §74-§75, 6 policies).
 * This is the most complex RLS surface in the project:
 *   - 6 policies (athlete_select/update, coach_select/update/insert/delete)
 *   - State machine via `status` gate (4 valid states for athlete, more for coach)
 *   - Asymmetric USING vs WITH CHECK on interviews_athlete_update
 *   - Cross-table subquery on coach_swimmer_assignments (coach ↔ athlete link)
 *   - Direct use of `auth.uid()` for coach created_by check
 *
 * Historical context: this table has never had a documented RLS bug yet, but
 * the sheer complexity makes it a prime candidate for silent regressions.
 * Any refactor that touches the status gate or the coach_swimmer_assignments
 * subquery could break visibility without a runtime error.
 *
 * Fixtures (from seed.sql):
 *   - users: Alice (1, athlete), Bob (2, athlete), Carol (3, coach), Diana (4, admin), Eve (5, coach)
 *   - coach_swimmer_assignments: Carol ↔ Alice (Carol is Alice's principal coach)
 *   - interviews:
 *     - i1 (draft_coach, created by Carol for Alice)
 *     - i2 (sent,        created by Eve   for Bob)
 *     - i3 (sent,        created by Eve   for Alice)
 *     - i4 (archived,    created by Eve   for Bob)   ← out of athlete status gate
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { asUser, asServiceRole, resetDb } from "./_helpers";

// Deterministic UUIDs: last segment = user id
const AUID = (n: number) =>
  `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

const ALICE = { appUserId: 1, appUserRole: "athlete" as const };
const BOB = { appUserId: 2, appUserRole: "athlete" as const };
const CAROL = {
  appUserId: 3,
  appUserRole: "coach" as const,
  authUid: AUID(3),
};
const DIANA = {
  appUserId: 4,
  appUserRole: "admin" as const,
  authUid: AUID(4),
};
const EVE = { appUserId: 5, appUserRole: "coach" as const, authUid: AUID(5) };

const I1 = "10000000-0000-0000-0000-000000000001"; // Carol → Alice, draft_coach
const I2 = "10000000-0000-0000-0000-000000000002"; // Eve   → Bob,   sent
const I3 = "10000000-0000-0000-0000-000000000003"; // Eve   → Alice, sent
const I4 = "10000000-0000-0000-0000-000000000004"; // Eve   → Bob,   archived

beforeAll(async () => {
  await resetDb();
});

// Some tests mutate data (status transitions). Re-seed between cases that
// touch the state machine. Tests that only read don't need this.
async function reseedInterviews() {
  await asServiceRole(async (c) => {
    await c.query("TRUNCATE public.interviews");
    await c.query(
      `INSERT INTO public.interviews (id, athlete_id, status, date, created_by) VALUES
         ($1, 1, 'draft_coach', '2026-04-01', $5),
         ($2, 2, 'sent',        '2026-04-02', $6),
         ($3, 1, 'sent',        '2026-04-03', $6),
         ($4, 2, 'archived',    '2026-04-04', $6)`,
      [I1, I2, I3, I4, AUID(3), AUID(5)],
    );
  });
}

describe("interviews RLS", () => {
  describe("SELECT — athlete status gate", () => {
    it("Alice sees her own interviews with a valid status (draft_coach, sent)", async () => {
      const rows = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: string; status: string }>(
          "SELECT id, status FROM interviews ORDER BY date",
        );
        return r.rows;
      });
      expect(rows.map((r) => r.id).sort()).toEqual([I1, I3].sort());
    });

    it("Alice does NOT see Bob's interviews (athlete_id filter)", async () => {
      const rows = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: string }>(
          "SELECT id FROM interviews WHERE athlete_id = 2",
        );
        return r.rows;
      });
      expect(rows).toEqual([]);
    });

    it("Bob does NOT see his interview in 'archived' status (status gate)", async () => {
      // This is the regression test: if a coach archives an interview,
      // the athlete immediately loses visibility. The policy filter
      // `status IN ('draft_athlete','draft_coach','sent','signed')` is what
      // enforces this. A future refactor dropping the status clause would
      // leak archived interviews to the athlete UI.
      const rows = await asUser(BOB, async (c) => {
        const r = await c.query<{ id: string }>(
          "SELECT id FROM interviews WHERE id = $1",
          [I4],
        );
        return r.rows;
      });
      expect(rows).toEqual([]);
    });

    it("Bob DOES see his interview in 'sent' status (valid state)", async () => {
      const rows = await asUser(BOB, async (c) => {
        const r = await c.query<{ id: string }>(
          "SELECT id FROM interviews WHERE id = $1",
          [I2],
        );
        return r.rows;
      });
      expect(rows).toEqual([{ id: I2 }]);
    });
  });

  describe("SELECT — coach created_by / assigned branch", () => {
    it("Carol sees interviews she created (i1)", async () => {
      const rows = await asUser(CAROL, async (c) => {
        const r = await c.query<{ id: string }>(
          "SELECT id FROM interviews WHERE id = $1",
          [I1],
        );
        return r.rows;
      });
      expect(rows).toEqual([{ id: I1 }]);
    });

    it("Carol sees Alice's interviews NOT created by her, via coach_swimmer_assignments (i3)", async () => {
      // Carol didn't create i3 (Eve did), but she's Alice's principal coach
      // through coach_swimmer_assignments, so the second branch of the OR
      // in interviews_coach_select should grant visibility.
      const rows = await asUser(CAROL, async (c) => {
        const r = await c.query<{ id: string }>(
          "SELECT id FROM interviews WHERE id = $1",
          [I3],
        );
        return r.rows;
      });
      expect(rows).toEqual([{ id: I3 }]);
    });

    it("Carol does NOT see Bob's interviews (Bob not in her coach_swimmer_assignments)", async () => {
      const rows = await asUser(CAROL, async (c) => {
        const r = await c.query<{ id: string; athlete_id: number }>(
          "SELECT id, athlete_id FROM interviews WHERE athlete_id = 2",
        );
        return r.rows;
      });
      expect(rows).toEqual([]);
    });

    it("Eve sees interviews she created, even for unassigned athletes (i2, i3, i4)", async () => {
      const rows = await asUser(EVE, async (c) => {
        const r = await c.query<{ id: string }>(
          "SELECT id FROM interviews ORDER BY date",
        );
        return r.rows;
      });
      expect(rows.map((r) => r.id).sort()).toEqual([I2, I3, I4].sort());
    });

    it("Eve does NOT see i1 (created by Carol, Eve has no CSA with Alice)", async () => {
      const rows = await asUser(EVE, async (c) => {
        const r = await c.query<{ id: string }>(
          "SELECT id FROM interviews WHERE id = $1",
          [I1],
        );
        return r.rows;
      });
      expect(rows).toEqual([]);
    });

    it("Diana (admin) sees all 4 interviews regardless of status or ownership", async () => {
      const rows = await asUser(DIANA, async (c) => {
        const r = await c.query<{ id: string }>("SELECT id FROM interviews");
        return r.rows;
      });
      expect(rows).toHaveLength(4);
    });
  });

  describe("UPDATE — athlete USING vs WITH CHECK asymmetry", () => {
    beforeEach(async () => {
      await reseedInterviews();
    });

    it("Alice CAN update her own interview when status is in USING set ('sent' → 'signed')", async () => {
      const updated = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: string; status: string }>(
          "UPDATE interviews SET status = 'signed' WHERE id = $1 RETURNING id, status",
          [I3],
        );
        return r.rows;
      });
      expect(updated).toEqual([{ id: I3, status: "signed" }]);
    });

    it("Alice CANNOT update her interview in 'draft_coach' (USING excludes draft_coach)", async () => {
      // i1 is 'draft_coach'. USING clause allows only 'draft_athlete' or 'sent'.
      // The row becomes invisible to the UPDATE → 0 rows affected.
      const updated = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: string }>(
          "UPDATE interviews SET athlete_goals = 'new' WHERE id = $1 RETURNING id",
          [I1],
        );
        return r.rows;
      });
      expect(updated).toEqual([]);
    });

    it("Alice CANNOT move her interview to a state outside WITH CHECK ('sent' → 'archived' fails)", async () => {
      // USING passes ('sent'), but WITH CHECK rejects 'archived' (not in allowed set).
      // This must raise, not silently no-op.
      await expect(
        asUser(ALICE, async (c) => {
          await c.query(
            "UPDATE interviews SET status = 'archived' WHERE id = $1",
            [I3],
          );
        }),
      ).rejects.toThrow(/row-level security|new row violates/);
    });

    it("Bob CANNOT update Alice's interview (athlete_id filter in USING)", async () => {
      const updated = await asUser(BOB, async (c) => {
        const r = await c.query<{ id: string }>(
          "UPDATE interviews SET athlete_goals = 'hacked' WHERE id = $1 RETURNING id",
          [I3],
        );
        return r.rows;
      });
      expect(updated).toEqual([]);
    });
  });

  describe("DELETE — coach created_by check", () => {
    beforeEach(async () => {
      await reseedInterviews();
    });

    it("Carol CAN delete her own interview (created_by match)", async () => {
      const deleted = await asUser(CAROL, async (c) => {
        const r = await c.query<{ id: string }>(
          "DELETE FROM interviews WHERE id = $1 RETURNING id",
          [I1],
        );
        return r.rows;
      });
      expect(deleted).toEqual([{ id: I1 }]);
    });

    it("Carol CANNOT delete Eve's interview, even for an assigned swimmer (i3)", async () => {
      // Alice is Carol's assigned swimmer, but i3 was created by Eve.
      // interviews_coach_delete only checks created_by = auth.uid(), NOT the
      // coach_swimmer_assignments branch. This is asymmetric with SELECT/UPDATE
      // which DO check assignments. Subtle policy design, worth asserting.
      const deleted = await asUser(CAROL, async (c) => {
        const r = await c.query<{ id: string }>(
          "DELETE FROM interviews WHERE id = $1 RETURNING id",
          [I3],
        );
        return r.rows;
      });
      expect(deleted).toEqual([]);
    });

    it("Diana (admin) CAN delete any interview", async () => {
      const deleted = await asUser(DIANA, async (c) => {
        const r = await c.query<{ id: string }>(
          "DELETE FROM interviews WHERE id = $1 RETURNING id",
          [I2],
        );
        return r.rows;
      });
      expect(deleted).toEqual([{ id: I2 }]);
    });
  });
});
