/**
 * §184 — RLS tests for pace_share_links + get_pace_share_payload RPC
 *
 * Verifies that:
 * - A coach can INSERT their own share link.
 * - Another coach cannot SELECT a foreign share link.
 * - Anon cannot INSERT or SELECT share links (RLS blocks both).
 * - The SECURITY DEFINER RPC get_pace_share_payload:
 *     • returns payload for a valid non-expired token (callable by anon)
 *     • returns NULL for expired token
 *     • returns NULL for unknown token
 */
import { describe, it, expect, beforeAll } from "vitest";
import { asUser, asServiceRole, asAnon, resetDb } from "./_helpers";

const CAROL_UID = "00000000-0000-0000-0000-000000000003";
const EVE_UID   = "00000000-0000-0000-0000-000000000005";

const CAROL = { appUserId: 3, appUserRole: "coach" as const, authUid: CAROL_UID };
const EVE   = { appUserId: 5, appUserRole: "coach" as const, authUid: EVE_UID };

const ALICE_ID = 1;

let validToken: string;
let expiredToken: string;

beforeAll(async () => {
  await resetDb();

  await asServiceRole(async (c) => {
    // Seed Carol's zones (needed by get_pace_share_payload)
    await c.query(
      `INSERT INTO coach_pace_zones (coach_id, v0_pct, v1_pct, v2_pct, v3_pct, max_pct)
       VALUES ($1, 140, 130, 115, 110, 105)
       ON CONFLICT (coach_id) DO UPDATE SET v0_pct=140`,
      [CAROL_UID],
    );

    // Seed a valid (non-expired) share link for Carol → Alice
    const valid = await c.query(
      `INSERT INTO pace_share_links (coach_id, swimmer_account_id, swimmer_manual_id, expires_at)
       VALUES ($1, $2, NULL, now() + INTERVAL '30 days')
       RETURNING token`,
      [CAROL_UID, ALICE_ID],
    );
    validToken = valid.rows[0].token;

    // Seed an expired share link
    const expired = await c.query(
      `INSERT INTO pace_share_links (coach_id, swimmer_account_id, swimmer_manual_id, expires_at)
       VALUES ($1, $2, NULL, now() - INTERVAL '1 day')
       RETURNING token`,
      [CAROL_UID, ALICE_ID],
    );
    expiredToken = expired.rows[0].token;
  });
});

describe("pace_share_links RLS (§184)", () => {
  it("coach A INSERT share link for own swimmer → OK", async () => {
    const rows = await asUser(CAROL, async (c) => {
      const r = await c.query(
        `INSERT INTO pace_share_links (coach_id, swimmer_account_id, swimmer_manual_id)
         VALUES ($1, $2, NULL) RETURNING token`,
        [CAROL_UID, ALICE_ID],
      );
      return r.rowCount;
    });
    expect(rows).toBe(1);
  });

  it("coach B SELECT coach A share links → 0 rows", async () => {
    const count = await asUser(EVE, async (c) => {
      const r = await c.query(
        "SELECT * FROM pace_share_links WHERE coach_id = $1",
        [CAROL_UID],
      );
      return r.rowCount;
    });
    expect(count).toBe(0);
  });

  it("anon INSERT share link → RLS error (WITH CHECK blocks)", async () => {
    await expect(
      asAnon(async (c) => {
        await c.query(
          `INSERT INTO pace_share_links (coach_id, swimmer_account_id, swimmer_manual_id)
           VALUES ($1, $2, NULL)`,
          [CAROL_UID, ALICE_ID],
        );
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it("anon SELECT share links → 0 rows (USING blocks)", async () => {
    const count = await asAnon(async (c) => {
      const r = await c.query("SELECT * FROM pace_share_links");
      return r.rowCount;
    });
    expect(count).toBe(0);
  });

  it("anon calls get_pace_share_payload with valid token → non-null payload", async () => {
    const payload = await asAnon(async (c) => {
      const r = await c.query(
        "SELECT get_pace_share_payload($1) AS payload",
        [validToken],
      );
      return r.rows[0].payload;
    });
    expect(payload).not.toBeNull();
    expect(payload).toHaveProperty("swimmer_name");
    expect(payload).toHaveProperty("zones");
    expect(payload).toHaveProperty("targets");
  });

  it("anon calls get_pace_share_payload with expired token → NULL", async () => {
    const payload = await asAnon(async (c) => {
      const r = await c.query(
        "SELECT get_pace_share_payload($1) AS payload",
        [expiredToken],
      );
      return r.rows[0].payload;
    });
    expect(payload).toBeNull();
  });

  it("anon calls get_pace_share_payload with unknown token → NULL", async () => {
    const fakeToken = "00000000-0000-0000-0000-000000000000";
    const payload = await asAnon(async (c) => {
      const r = await c.query(
        "SELECT get_pace_share_payload($1) AS payload",
        [fakeToken],
      );
      return r.rows[0].payload;
    });
    expect(payload).toBeNull();
  });
});
