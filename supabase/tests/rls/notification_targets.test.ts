/**
 * RLS: public.notification_targets
 *
 * Historical bug: §16 fixed a broken group_members subquery that made group
 * notifications invisible to athletes. This suite locks that fix.
 *
 * Interesting asymmetry:
 *   - SELECT includes group_members branch (athlete sees group notifs)
 *   - UPDATE does NOT (athlete can mark-read DIRECT notifs only, NOT group ones)
 *   - This may be intentional (mark-read is personal action on personal target)
 *     or a gap. Either way, the test documents the current behavior.
 *
 * Fixtures (seed.sql):
 *   nt1: direct → Alice | nt2: group Cadets → Alice via group_members
 *   nt3: group Juniors → Bob | nt4: direct → Bob
 *   Groups: Alice in Cadets(1), Bob in Juniors(2)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { asUser, resetDb } from "./_helpers";

const ALICE = { appUserId: 1, appUserRole: "athlete" as const };
const BOB = { appUserId: 2, appUserRole: "athlete" as const };
const CAROL = { appUserId: 3, appUserRole: "coach" as const };

beforeAll(async () => {
  await resetDb();
});

describe("notification_targets RLS", () => {
  describe("SELECT — direct + group visibility (§16 regression)", () => {
    it("Alice sees nt1 (direct target)", async () => {
      const rows = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: number }>(
          "SELECT id FROM notification_targets WHERE id = 1",
        );
        return r.rows;
      });
      expect(rows).toEqual([{ id: 1 }]);
    });

    it("Alice sees nt2 (group Cadets — she's a member, §16 fix)", async () => {
      const rows = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: number }>(
          "SELECT id FROM notification_targets WHERE id = 2",
        );
        return r.rows;
      });
      expect(rows).toEqual([{ id: 2 }]);
    });

    it("Alice does NOT see nt3 (group Juniors — not a member)", async () => {
      const rows = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: number }>(
          "SELECT id FROM notification_targets WHERE id = 3",
        );
        return r.rows;
      });
      expect(rows).toEqual([]);
    });

    it("Alice does NOT see nt4 (direct to Bob)", async () => {
      const rows = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: number }>(
          "SELECT id FROM notification_targets WHERE id = 4",
        );
        return r.rows;
      });
      expect(rows).toEqual([]);
    });

    it("Alice sees exactly nt1 + nt2", async () => {
      const rows = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: number }>(
          "SELECT id FROM notification_targets ORDER BY id",
        );
        return r.rows;
      });
      expect(rows.map((r) => r.id)).toEqual([1, 2]);
    });

    it("coach sees all 4 (bypass)", async () => {
      const rows = await asUser(CAROL, async (c) => {
        const r = await c.query<{ id: number }>(
          "SELECT id FROM notification_targets ORDER BY id",
        );
        return r.rows;
      });
      expect(rows).toHaveLength(4);
    });
  });

  describe("UPDATE — mark-read asymmetry (SELECT includes groups, UPDATE does NOT)", () => {
    it("Alice CAN mark-read nt1 (direct target — UPDATE policy matches)", async () => {
      const updated = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: number }>(
          "UPDATE notification_targets SET read_at = now() WHERE id = 1 RETURNING id",
        );
        return r.rows;
      });
      expect(updated).toEqual([{ id: 1 }]);
    });

    it("Alice CANNOT mark-read nt2 (group target — UPDATE policy lacks group branch)", async () => {
      // This documents the asymmetry: Alice can SEE nt2 (group Cadets) but
      // CANNOT update it (mark as read). The UPDATE policy only checks
      // target_user_id, not the group_members subquery. Whether this is
      // intentional or a gap, the test ensures the behavior doesn't change
      // silently. If you want group mark-read, update the policy AND this test.
      const updated = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: number }>(
          "UPDATE notification_targets SET read_at = now() WHERE id = 2 RETURNING id",
        );
        return r.rows;
      });
      expect(updated).toEqual([]);
    });

    it("Alice CANNOT mark-read nt4 (Bob's direct — not her target)", async () => {
      const updated = await asUser(ALICE, async (c) => {
        const r = await c.query<{ id: number }>(
          "UPDATE notification_targets SET read_at = now() WHERE id = 4 RETURNING id",
        );
        return r.rows;
      });
      expect(updated).toEqual([]);
    });

    it("coach CAN mark-read any notification (bypass)", async () => {
      const updated = await asUser(CAROL, async (c) => {
        const r = await c.query<{ id: number }>(
          "UPDATE notification_targets SET read_at = now() WHERE id = 3 RETURNING id",
        );
        return r.rows;
      });
      expect(updated).toEqual([{ id: 3 }]);
    });
  });

  describe("INSERT — athlete blocked", () => {
    it("athlete CANNOT insert notification targets", async () => {
      await expect(
        asUser(ALICE, async (c) => {
          await c.query(
            "INSERT INTO notification_targets (notification_id, target_user_id) VALUES (1, 1)",
          );
        }),
      ).rejects.toThrow(/row-level security|new row violates/);
    });
  });
});
