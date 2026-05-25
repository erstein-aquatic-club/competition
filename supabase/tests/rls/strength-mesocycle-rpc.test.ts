/**
 * RLS: RPC apply_strength_mesocycle + revert_strength_mesocycle (§293).
 *
 * Chantier C+D — Phase 4. Migrations 00172 (apply) + 00173 (revert).
 * Le mapping est documenté dans
 * docs/plans/bilan-muscu-mapping-mesocycle-planning.md.
 *
 * Invariants testés :
 *   - apply : un nageur applique pour lui-même ✓ ; pour un autre ✗ ;
 *     coach peut appliquer pour n'importe quel nageur ✓.
 *   - apply : snapshot et overrides (slots + week_meta) sont créés en fenêtre.
 *   - apply : supersede du précédent mésocycle 'active' du même nageur.
 *   - revert : restaure le snapshot, marque 'reverted'.
 *   - revert : autorisé au coach, refusé à un autre nageur.
 *   - revert : refusé sur un mésocycle non-active, refusé si inexistant.
 *
 * Fixtures : seedées dans schema.sql + seed.sql (Alice id=1, Bob=2, Carol
 * coach=3, Diana admin=4). Assessment/template seedés en §285/§292.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { asUser, asServiceRole, resetDb } from "./_helpers";

const ALICE = { appUserId: 1, appUserRole: "athlete" as const };
const BOB   = { appUserId: 2, appUserRole: "athlete" as const };
const CAROL = { appUserId: 3, appUserRole: "coach" as const };

const A_ASSESS = "a0000000-0000-0000-0000-000000000001";
const B_ASSESS = "a0000000-0000-0000-0000-000000000002";
const TEMPLATE = "c0000000-0000-0000-0000-000000000001";

const START_MONDAY = "2026-06-01"; // lundi

/** Payload p_weeks minimal mais structuré : 2 semaines × 2 sessions. */
const PAYLOAD = JSON.stringify([
  {
    week_number: 1,
    cycle: "prepa_generale",
    sessions: [
      {
        session_number: 1,
        buckets: ["lower_strength"],
        exercises: [
          { exercise_id: 1001, bucket: "mobility",       is_core: false, sets: 2, reps: 10, intensity_pct_1rm: null, rest_seconds: 30,  intention: null, substituted: false, original_exercise_id: null },
          { exercise_id: 1002, bucket: "lower_strength", is_core: true,  sets: 4, reps: 5,  intensity_pct_1rm: 85,   rest_seconds: 180, intention: null, substituted: false, original_exercise_id: null },
        ],
      },
      {
        session_number: 2,
        buckets: ["upper_strength"],
        exercises: [
          { exercise_id: 1001, bucket: "mobility",       is_core: false, sets: 2, reps: 10, intensity_pct_1rm: null, rest_seconds: 30,  intention: null, substituted: false, original_exercise_id: null },
          { exercise_id: 1003, bucket: "upper_strength", is_core: true,  sets: 3, reps: 8,  intensity_pct_1rm: 70,   rest_seconds: 120, intention: null, substituted: false, original_exercise_id: null },
        ],
      },
    ],
  },
  {
    week_number: 2,
    cycle: "force_max",
    sessions: [
      {
        session_number: 1,
        buckets: ["lower_strength"],
        exercises: [
          { exercise_id: 1002, bucket: "lower_strength", is_core: true,  sets: 4, reps: 5,  intensity_pct_1rm: 90,   rest_seconds: 180, intention: null, substituted: false, original_exercise_id: null },
        ],
      },
      {
        session_number: 2,
        buckets: ["upper_strength"],
        exercises: [
          { exercise_id: 1003, bucket: "upper_strength", is_core: true,  sets: 4, reps: 5,  intensity_pct_1rm: 85,   rest_seconds: 180, intention: null, substituted: false, original_exercise_id: null },
        ],
      },
    ],
  },
]);

const REASONING = JSON.stringify({
  bucketScores: { lower_strength: 50, lower_power: 50, upper_strength: 50, upper_power: 50, mobility: 50, psychology: 50 },
  bucketPriorities: [],
  bucketAllocations: [],
  dataConfidence: "full",
  psychFlag: false,
  lowestBaremeConfidence: "transposed",
  activeContraindications: [],
});

/** Centralise l'appel SQL — moins de verbosité dans les tests. */
const applySql = `SELECT apply_strength_mesocycle(
  $1::int, $2::uuid, $3::uuid, 'sprint', 'season',
  2, 2, $4::date, $5::jsonb, '1.0.0', $6::jsonb
) AS mesocycle_id`;

beforeAll(async () => {
  await resetDb();
});

describe("apply_strength_mesocycle RLS", () => {
  it("Alice peut générer son propre mésocycle", async () => {
    const { rows } = await asUser(ALICE, async (c) => {
      return c.query<{ mesocycle_id: string }>(applySql, [
        1, A_ASSESS, TEMPLATE, START_MONDAY, REASONING, PAYLOAD,
      ]);
    });
    expect(rows.length).toBe(1);
    expect(rows[0].mesocycle_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it("Alice NE peut PAS générer pour Bob", async () => {
    await expect(
      asUser(ALICE, async (c) => {
        await c.query(applySql, [
          2, B_ASSESS, TEMPLATE, START_MONDAY, REASONING, PAYLOAD,
        ]);
      }),
    ).rejects.toThrow(/not authorized|unauthorized/i);
  });

  it("Carol (coach) peut générer pour Alice", async () => {
    const { rows } = await asUser(CAROL, async (c) => {
      return c.query<{ mesocycle_id: string }>(applySql, [
        1, A_ASSESS, TEMPLATE, START_MONDAY, REASONING, PAYLOAD,
      ]);
    });
    expect(rows[0].mesocycle_id).toBeTruthy();
  });

  it("apply matérialise le mésocycle, le snapshot, les sessions et les overrides", async () => {
    await asUser(ALICE, async (c) => {
      const apply = await c.query<{ mesocycle_id: string }>(applySql, [
        1, A_ASSESS, TEMPLATE, START_MONDAY, REASONING, PAYLOAD,
      ]);
      const mesoId = apply.rows[0].mesocycle_id;

      // 1. La ligne strength_mesocycles existe et est 'active'.
      const meso = await c.query<{ status: string; athlete_id: number; target_week_count: number }>(
        "SELECT status, athlete_id, target_week_count FROM strength_mesocycles WHERE id = $1",
        [mesoId],
      );
      expect(meso.rows[0]).toEqual({ status: "active", athlete_id: 1, target_week_count: 2 });

      // 2. Un snapshot a été créé.
      const snap = await c.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM strength_planning_snapshots WHERE mesocycle_id = $1",
        [mesoId],
      );
      expect(snap.rows[0].count).toBe("1");

      // 3. 4 sessions (2 semaines × 2 sessions) → 4 strength_sessions templates,
      //    avec un nom préfixé '[Méso ...]'.
      const tplCount = await c.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM strength_sessions WHERE name LIKE '[Méso %' AND created_by = 1",
      );
      expect(tplCount.rows[0].count).toBe("4");

      // 4. 6 items au total (3 + 1 + 1 = 5 + 1 mobility en semaine 1 sess 2 = 6, cf. PAYLOAD)
      const itemsCount = await c.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM strength_session_items
          WHERE raw_payload->>'mesocycle_id' = $1`,
        [mesoId],
      );
      expect(itemsCount.rows[0].count).toBe("6");

      // 5. slot_overrides : 4 lignes (1 par session) en fenêtre, time_slot='evening'.
      const slots = await c.query<{ week_start: string; day_of_week: number; time_slot: string }>(
        `SELECT week_start::text, day_of_week, time_slot
           FROM strength_planning_slot_overrides
          WHERE athlete_id = 1 AND notes LIKE 'Mésocycle %'
          ORDER BY week_start, day_of_week`,
      );
      expect(slots.rows.length).toBe(4);
      expect(slots.rows.every((r) => r.time_slot === "evening")).toBe(true);

      // 6. sessionsPerWeek=2 → jours [0=Lun, 3=Jeu].
      const days = new Set(slots.rows.map((r) => r.day_of_week));
      expect(days).toEqual(new Set([0, 3]));

      // 7. week_overrides : 2 lignes (une par semaine), week_type = label cycle.
      const weeks = await c.query<{ week_type: string }>(
        `SELECT week_type FROM strength_planning_week_overrides
          WHERE athlete_id = 1 AND notes LIKE 'Mésocycle %'
          ORDER BY week_start`,
      );
      expect(weeks.rows.map((r) => r.week_type)).toEqual(["Préparation générale", "Force max"]);
    });
  });

  it("apply supersede le mésocycle 'active' précédent du même nageur", async () => {
    await asUser(ALICE, async (c) => {
      const first = await c.query<{ mesocycle_id: string }>(applySql, [
        1, A_ASSESS, TEMPLATE, START_MONDAY, REASONING, PAYLOAD,
      ]);
      const second = await c.query<{ mesocycle_id: string }>(applySql, [
        1, A_ASSESS, TEMPLATE, START_MONDAY, REASONING, PAYLOAD,
      ]);

      const statuses = await c.query<{ id: string; status: string }>(
        "SELECT id, status FROM strength_mesocycles WHERE athlete_id = 1 ORDER BY created_at",
      );
      const byId = new Map(statuses.rows.map((r) => [r.id, r.status]));
      expect(byId.get(first.rows[0].mesocycle_id)).toBe("superseded");
      expect(byId.get(second.rows[0].mesocycle_id)).toBe("active");
    });
  });

  it("apply crée une notification ciblée sur le groupe du nageur", async () => {
    await asUser(ALICE, async (c) => {
      const apply = await c.query<{ mesocycle_id: string }>(applySql, [
        1, A_ASSESS, TEMPLATE, START_MONDAY, REASONING, PAYLOAD,
      ]);
      const mesoId = apply.rows[0].mesocycle_id;

      const notifs = await c.query<{ title: string; kind: string; target_group_id: number | null }>(
        `SELECT n.title, n.metadata->>'kind' AS kind, nt.target_group_id
           FROM notifications n
           JOIN notification_targets nt ON nt.notification_id = n.id
          WHERE n.metadata->>'mesocycle_id' = $1`,
        [mesoId],
      );
      expect(notifs.rows.length).toBe(1);
      expect(notifs.rows[0].title).toBe("Nouveau mésocycle muscu");
      expect(notifs.rows[0].kind).toBe("strength_mesocycle_generated");
      expect(notifs.rows[0].target_group_id).toBe(1); // Alice est dans Cadets (group 1)
    });
  });
});

describe("revert_strength_mesocycle RLS", () => {
  it("Alice peut revert son propre mésocycle ; statut → 'reverted', snapshot restauré (vide)", async () => {
    await asUser(ALICE, async (c) => {
      const apply = await c.query<{ mesocycle_id: string }>(applySql, [
        1, A_ASSESS, TEMPLATE, START_MONDAY, REASONING, PAYLOAD,
      ]);
      const mesoId = apply.rows[0].mesocycle_id;

      // Pré-revert : 4 slot_overrides + 2 week_overrides + 4 templates pour ce méso.
      const preSlot = await c.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM strength_planning_slot_overrides
          WHERE athlete_id = 1 AND notes LIKE 'Mésocycle %'`,
      );
      expect(preSlot.rows[0].count).toBe("4");

      await c.query("SELECT revert_strength_mesocycle($1::uuid)", [mesoId]);

      // Post-revert : statut 'reverted'.
      const post = await c.query<{ status: string }>(
        "SELECT status FROM strength_mesocycles WHERE id = $1",
        [mesoId],
      );
      expect(post.rows[0].status).toBe("reverted");

      // Post-revert : tous les overrides du mésocycle ont disparu (le snapshot
      // était vide puisque la planif d'Alice était vide avant l'apply).
      const postSlot = await c.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM strength_planning_slot_overrides
          WHERE athlete_id = 1 AND notes LIKE 'Mésocycle %'`,
      );
      expect(postSlot.rows[0].count).toBe("0");

      const postWeek = await c.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM strength_planning_week_overrides
          WHERE athlete_id = 1 AND notes LIKE 'Mésocycle %'`,
      );
      expect(postWeek.rows[0].count).toBe("0");

      // Post-revert : les templates strength_sessions ont été supprimés (CASCADE).
      const postTpl = await c.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM strength_sessions
          WHERE name LIKE '[Méso %' AND created_by = 1`,
      );
      expect(postTpl.rows[0].count).toBe("0");
    });
  });

  it("Bob ne peut PAS revert le mésocycle d'Alice", async () => {
    await asUser(ALICE, async (c) => {
      const apply = await c.query<{ mesocycle_id: string }>(applySql, [
        1, A_ASSESS, TEMPLATE, START_MONDAY, REASONING, PAYLOAD,
      ]);
      const mesoId = apply.rows[0].mesocycle_id;

      // Bascule des claims sur Bob, garde la même transaction.
      await c.query(
        `SET LOCAL "request.jwt.claims" TO '${JSON.stringify({
          sub: "00000000-0000-0000-0000-000000000002",
          app_metadata: { app_user_id: 2, app_user_role: "athlete" },
        })}'`,
      );

      await expect(
        c.query("SELECT revert_strength_mesocycle($1::uuid)", [mesoId]),
      ).rejects.toThrow(/not authorized/i);
    });
  });

  it("Carol (coach) peut revert le mésocycle d'Alice + notif au nageur", async () => {
    await asUser(ALICE, async (c) => {
      const apply = await c.query<{ mesocycle_id: string }>(applySql, [
        1, A_ASSESS, TEMPLATE, START_MONDAY, REASONING, PAYLOAD,
      ]);
      const mesoId = apply.rows[0].mesocycle_id;

      await c.query(
        `SET LOCAL "request.jwt.claims" TO '${JSON.stringify({
          sub: "00000000-0000-0000-0000-000000000003",
          app_metadata: { app_user_id: 3, app_user_role: "coach" },
        })}'`,
      );

      await c.query("SELECT revert_strength_mesocycle($1::uuid)", [mesoId]);

      const status = await c.query<{ status: string }>(
        "SELECT status FROM strength_mesocycles WHERE id = $1",
        [mesoId],
      );
      expect(status.rows[0].status).toBe("reverted");

      // Notif côté nageur (revert venant du coach).
      const notif = await c.query<{ kind: string; target_user_id: number }>(
        `SELECT n.metadata->>'kind' AS kind, nt.target_user_id
           FROM notifications n
           JOIN notification_targets nt ON nt.notification_id = n.id
          WHERE n.metadata->>'mesocycle_id' = $1
            AND n.metadata->>'kind' = 'strength_mesocycle_reverted'`,
        [mesoId],
      );
      expect(notif.rows.length).toBe(1);
      expect(notif.rows[0].target_user_id).toBe(1);
    });
  });

  it("revert d'un mésocycle déjà 'reverted' lève une exception", async () => {
    await asUser(ALICE, async (c) => {
      const apply = await c.query<{ mesocycle_id: string }>(applySql, [
        1, A_ASSESS, TEMPLATE, START_MONDAY, REASONING, PAYLOAD,
      ]);
      const mesoId = apply.rows[0].mesocycle_id;

      await c.query("SELECT revert_strength_mesocycle($1::uuid)", [mesoId]);
      await expect(
        c.query("SELECT revert_strength_mesocycle($1::uuid)", [mesoId]),
      ).rejects.toThrow(/only 'active' can be reverted/i);
    });
  });

  it("revert d'un mésocycle inexistant lève une exception 'not found'", async () => {
    await asUser(ALICE, async (c) => {
      await expect(
        c.query(
          "SELECT revert_strength_mesocycle('00000000-0000-0000-0000-000000000000'::uuid)",
        ),
      ).rejects.toThrow(/not found/i);
    });
  });

  it("snapshot pré-existant : revert restaure l'override d'avant l'apply", async () => {
    await asUser(ALICE, async (c) => {
      // 1. Bootstrap : Alice avait un override "manuel" en S1 J1 evening avant
      //    de lancer son mésocycle.
      //    On le pose en tant que coach (RLS WRITE coach/admin), puis on
      //    revient sur Alice pour faire l'apply.
      await c.query(
        `SET LOCAL "request.jwt.claims" TO '${JSON.stringify({
          sub: "00000000-0000-0000-0000-000000000003",
          app_metadata: { app_user_id: 3, app_user_role: "coach" },
        })}'`,
      );
      await c.query(
        `INSERT INTO strength_planning_slot_overrides
          (athlete_id, week_start, day_of_week, time_slot, session_template_id, notes)
         VALUES (1, $1::date, 0, 'evening', NULL, 'pre-existing manual')`,
        [START_MONDAY],
      );

      // 2. Apply en tant qu'Alice → l'override en S1 J1 doit être remplacé (UPSERT).
      await c.query(
        `SET LOCAL "request.jwt.claims" TO '${JSON.stringify({
          sub: "00000000-0000-0000-0000-000000000001",
          app_metadata: { app_user_id: 1, app_user_role: "athlete" },
        })}'`,
      );
      const apply = await c.query<{ mesocycle_id: string }>(applySql, [
        1, A_ASSESS, TEMPLATE, START_MONDAY, REASONING, PAYLOAD,
      ]);
      const mesoId = apply.rows[0].mesocycle_id;

      // Pendant l'apply : l'override est remplacé par le template du mésocycle.
      const mid = await c.query<{ notes: string }>(
        `SELECT notes FROM strength_planning_slot_overrides
          WHERE athlete_id = 1 AND week_start = $1::date AND day_of_week = 0`,
        [START_MONDAY],
      );
      expect(mid.rows[0].notes).toMatch(/^Mésocycle /);

      // 3. Revert → l'override pré-existant est restauré.
      await c.query("SELECT revert_strength_mesocycle($1::uuid)", [mesoId]);

      const after = await c.query<{ notes: string }>(
        `SELECT notes FROM strength_planning_slot_overrides
          WHERE athlete_id = 1 AND week_start = $1::date AND day_of_week = 0`,
        [START_MONDAY],
      );
      expect(after.rows[0].notes).toBe("pre-existing manual");
    });
  });

  it("§300 — édition coach d'une séance générée (raw_payload préservé) : revert nettoie tout, zéro orphelin", async () => {
      await asUser(ALICE, async (c) => {
        const apply = await c.query<{ mesocycle_id: string }>(applySql, [
          1, A_ASSESS, TEMPLATE, START_MONDAY, REASONING, PAYLOAD,
        ]);
        const mesoId = apply.rows[0].mesocycle_id;

        const sess = await c.query<{ id: number }>(
          `SELECT id FROM strength_sessions WHERE name LIKE '[Méso %' AND created_by = 1 ORDER BY id LIMIT 1`,
        );
        const sessionId = sess.rows[0].id;

        // Édition coach (RLS WRITE coach/admin) : simule update_strength_session_atomic
        // + §300 Part 1 — re-insère les items en PRÉSERVANT mesocycle_id, + 1 item
        // AJOUTÉ qui hérite du tag (reconcileMesocyclePayloads).
        await c.query(
          `SET LOCAL "request.jwt.claims" TO '${JSON.stringify({
            sub: "00000000-0000-0000-0000-000000000003",
            app_metadata: { app_user_id: 3, app_user_role: "coach" },
          })}'`,
        );
        await c.query(`DELETE FROM strength_session_items WHERE session_id = $1`, [
          sessionId,
        ]);
        await c.query(
          `INSERT INTO strength_session_items
             (session_id, ordre, exercise_id, block, cycle_type, sets, reps, pct_1rm, rest_series_s, notes, raw_payload)
           VALUES
            ($1, 0, 1002, 'main', 'force', 5, 3, 90, 200, 'édité coach', $2::jsonb),
            ($1, 1, 1003, 'main', 'force', 3, 8, 70, 120, 'ajouté coach', $3::jsonb)`,
          [
            sessionId,
            JSON.stringify({ mesocycle_id: mesoId, periodization_cycle: "force_max" }),
            JSON.stringify({ mesocycle_id: mesoId }),
          ],
        );

        // L'édité ET l'ajouté portent le mesocycle_id (invariant Part 1).
        const tagged = await c.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM strength_session_items
            WHERE raw_payload->>'mesocycle_id' = $1`,
          [mesoId],
        );
        expect(Number(tagged.rows[0].count)).toBeGreaterThanOrEqual(2);

        // Revert : identifie les séances via le tag → CASCADE delete des items.
        await c.query("SELECT revert_strength_mesocycle($1::uuid)", [mesoId]);

        const residualItems = await c.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM strength_session_items
            WHERE raw_payload->>'mesocycle_id' = $1`,
          [mesoId],
        );
        expect(residualItems.rows[0].count).toBe("0");

        const residualSessions = await c.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM strength_sessions
            WHERE name LIKE '[Méso %' AND created_by = 1`,
        );
        expect(residualSessions.rows[0].count).toBe("0");
      });
    });
});

// ── §308 — Re-génération propre (clean replace, mid-week, isolation) ──────────
//
// La RPC apply, post-§307, ne contenait aucun DELETE : re-générer un plan avec
// un autre jeu de jours laissait les slots de l'ancien plan (superseded) sur les
// jours non réutilisés → plan affiché = UNION ancien+nouveau (séances zombies).
// §308 ajoute un nettoyage des slot/week overrides À PARTIR de la date de départ
// (jours pré-départ déjà entraînés préservés), avant la matérialisation.

/** apply 12-arg (§307/§308) : week count, sessions/sem. et date de départ explicites. */
const applySqlV2 = `SELECT apply_strength_mesocycle(
  $1::int, $2::uuid, $3::uuid, 'sprint', 'season',
  $4::int, $5::int, $6::date, $7::jsonb, '1.1.0', $8::jsonb, $9::date
) AS mesocycle_id`;
// args : athlete_id, assessment, template, target_week_count, sessions_per_week,
//        start_week_monday, reasoning, weeks_payload, start_date

const THURSDAY = "2026-06-04"; // START_MONDAY (lun 1er juin) + 3

/** Payload p_weeks jour-aware : 1 semaine, une séance par weekday coché. */
function weekdayPayload(weekdays: number[], cycle = "force_max"): string {
  return JSON.stringify([
    {
      week_number: 1,
      cycle,
      sessions: weekdays.map((wd, i) => ({
        session_number: i + 1,
        weekday: wd,
        role: wd === 0 || wd === 3 ? "amorce_pap" : "developpement",
        buckets: ["lower_strength"],
        exercises: [
          { exercise_id: 1002, bucket: "lower_strength", is_core: true, sets: 4, reps: 5, intensity_pct_1rm: 85, rest_seconds: 180, intention: null, substituted: false, original_exercise_id: null },
        ],
      })),
    },
  ]);
}

/** Jours (day_of_week) occupés par un athlète en semaine 1 (START_MONDAY). */
async function daysOf(c: Parameters<Parameters<typeof asUser>[1]>[0], athleteId: number): Promise<number[]> {
  const r = await c.query<{ day_of_week: number }>(
    `SELECT day_of_week FROM strength_planning_slot_overrides
      WHERE athlete_id = $1 AND week_start = $2::date ORDER BY day_of_week`,
    [athleteId, START_MONDAY],
  );
  return r.rows.map((x) => x.day_of_week);
}

describe("§308 — re-génération propre (clean replace / mid-week / isolation)", () => {
  it("re-générer avec un autre jeu de jours ne laisse PAS de séance orpheline", async () => {
    await asUser(ALICE, async (c) => {
      // M0 : Lun/Mer/Ven (3 séances).
      await c.query(applySqlV2, [1, A_ASSESS, TEMPLATE, 1, 3, START_MONDAY, REASONING, weekdayPayload([0, 2, 4]), null]);
      expect(await daysOf(c, 1)).toEqual([0, 2, 4]);

      // M1 : Lun/Jeu (2 séances) → doit REMPLACER, pas fusionner.
      await c.query(applySqlV2, [1, A_ASSESS, TEMPLATE, 1, 2, START_MONDAY, REASONING, weekdayPayload([0, 3]), null]);

      // Sans nettoyage : {0,2,4} ∪ {0,3} = {0,2,3,4} (orphelins Mer/Ven). Avec §308 : {0,3}.
      expect(await daysOf(c, 1)).toEqual([0, 3]);
    });
  });

  it("départ mid-week : jours pré-départ préservés, jour de départ ré-écrit", async () => {
    await asUser(ALICE, async (c) => {
      // M0 plein Lun/Jeu démarrant lundi.
      await c.query(applySqlV2, [1, A_ASSESS, TEMPLATE, 1, 2, START_MONDAY, REASONING, weekdayPayload([0, 3]), null]);
      expect(await daysOf(c, 1)).toEqual([0, 3]);

      // M1 mêmes jours mais départ JEUDI : lundi (pré-départ, déjà entraîné) doit
      // rester sur M0 ; jeudi ré-écrit par M1.
      await c.query(applySqlV2, [1, A_ASSESS, TEMPLATE, 1, 2, START_MONDAY, REASONING, weekdayPayload([0, 3]), THURSDAY]);
      expect(await daysOf(c, 1)).toEqual([0, 3]);

      const notes = await c.query<{ day_of_week: number; notes: string }>(
        `SELECT day_of_week, notes FROM strength_planning_slot_overrides
          WHERE athlete_id = 1 AND week_start = $1::date ORDER BY day_of_week`,
        [START_MONDAY],
      );
      // Lundi (M0 préservé) et jeudi (M1) pointent sur 2 mésocycles distincts.
      expect(notes.rows[0].notes).not.toBe(notes.rows[1].notes);
    });
  });

  it("isolation multi-nageurs : générer pour Bob ne touche pas les slots d'Alice", async () => {
    await asUser(CAROL, async (c) => {
      await c.query(applySqlV2, [1, A_ASSESS, TEMPLATE, 1, 2, START_MONDAY, REASONING, weekdayPayload([0, 3]), null]);
      const aliceBefore = await daysOf(c, 1);
      await c.query(applySqlV2, [2, B_ASSESS, TEMPLATE, 1, 2, START_MONDAY, REASONING, weekdayPayload([1, 4]), null]);
      expect(await daysOf(c, 1)).toEqual(aliceBefore); // Alice intacte
      expect(await daysOf(c, 2)).toEqual([1, 4]);      // Bob a ses propres jours
    });
  });

  it("revert après re-génération restaure l'état d'avant (supersede + snapshot)", async () => {
    await asUser(ALICE, async (c) => {
      await c.query(applySqlV2, [1, A_ASSESS, TEMPLATE, 1, 3, START_MONDAY, REASONING, weekdayPayload([0, 2, 4]), null]);
      const m1 = await c.query<{ mesocycle_id: string }>(applySqlV2, [1, A_ASSESS, TEMPLATE, 1, 2, START_MONDAY, REASONING, weekdayPayload([0, 3]), null]);
      expect(await daysOf(c, 1)).toEqual([0, 3]);

      await c.query("SELECT revert_strength_mesocycle($1::uuid)", [m1.rows[0].mesocycle_id]);
      expect(await daysOf(c, 1)).toEqual([0, 2, 4]); // snapshot M0 restauré
    });
  });
});
