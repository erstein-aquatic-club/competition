/**
 * RLS + semantics: public.get_coach_kpis (§223)
 *
 * Couvre la fonction RPC qui agrège les valeurs de fatigue (dim_sessions +
 * strength_session_runs) pour une liste d'athlètes sur une fenêtre date.
 * SECURITY INVOKER → l'appelant ne voit que les rows que son rôle peut lire
 * via les policies existantes sur les 2 tables.
 *
 * Fixtures (seed.sql) :
 *   • dim_sessions : Alice (id=1) a sessions id=1,2 (rpe=5,6 sur 2026-04-01/02)
 *                    Bob (id=2)   a session id=3 (rpe=4 sur 2026-04-01)
 *   • strength_session_runs : Alice run id=1 / Bob run id=2 (fatigue/raw_payload NULL,
 *                              pas de timestamps → ignorés par le filtre temporel)
 *   • RLS : athlete voit ses propres rows uniquement, coach/admin voient tout.
 *
 * Le RPC fallback fatigue = rpe quand fatigue NULL (coalesce(s.fatigue, s.rpe)).
 * Avec le seed actuel, swim fatigue values = rpe values (5, 6, 4).
 * Strength runs : pas de timestamps → 0 contribution.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { asUser, resetDb } from "./_helpers";

const ALICE = { appUserId: 1, appUserRole: "athlete" } as const;
const BOB = { appUserId: 2, appUserRole: "athlete" } as const;
const CAROL = { appUserId: 3, appUserRole: "coach" } as const;
const DIANA = { appUserId: 4, appUserRole: "admin" } as const;

type Row = {
  athlete_id: number;
  fatigue_values: string[] | number[]; // pg renvoie numeric[] sous forme de string[]
};

beforeAll(async () => {
  await resetDb();
});

describe("get_coach_kpis RPC — RLS coverage + SQL semantics", () => {
  it("coach sees fatigue values for both Alice and Bob (RLS allows coach to see all)", async () => {
    const rows = await asUser(CAROL, async (c) => {
      const r = await c.query<Row>(
        "SELECT athlete_id, fatigue_values FROM public.get_coach_kpis($1::int[], $2::date, $3::date) ORDER BY athlete_id",
        [[1, 2], "2026-04-01", "2026-04-30"],
      );
      return r.rows;
    });
    expect(rows).toHaveLength(2);

    // Alice : sessions id=1 (rpe=5) + id=2 (rpe=6) → fatigue_values agrège [5, 6]
    expect(rows[0].athlete_id).toBe(1);
    const aliceVals = (rows[0].fatigue_values as Array<string | number>).map(Number).sort();
    expect(aliceVals).toEqual([5, 6]);

    // Bob : session id=3 (rpe=4) → [4]
    expect(rows[1].athlete_id).toBe(2);
    const bobVals = (rows[1].fatigue_values as Array<string | number>).map(Number).sort();
    expect(bobVals).toEqual([4]);
  });

  it("admin sees fatigue values for all athletes (RLS allows admin)", async () => {
    const rows = await asUser(DIANA, async (c) => {
      const r = await c.query<Row>(
        "SELECT athlete_id, fatigue_values FROM public.get_coach_kpis($1::int[], $2::date, $3::date) ORDER BY athlete_id",
        [[1, 2], "2026-04-01", "2026-04-30"],
      );
      return r.rows;
    });
    expect(rows).toHaveLength(2);
    expect((rows[0].fatigue_values as Array<unknown>).length).toBeGreaterThan(0);
    expect((rows[1].fatigue_values as Array<unknown>).length).toBeGreaterThan(0);
  });

  it("athlete cannot leak other athletes' fatigue values via this RPC (RLS hides them)", async () => {
    // Alice essaie de lire les fatigue values de Bob (athlete_id=2).
    // SECURITY INVOKER + dim_sessions_select policy → Alice ne voit pas la session de Bob.
    // Le RPC retourne quand même une row pour athlete_id=2 (via unnest), mais avec fatigue_values vide.
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<Row>(
        "SELECT athlete_id, fatigue_values FROM public.get_coach_kpis($1::int[], $2::date, $3::date) ORDER BY athlete_id",
        [[1, 2], "2026-04-01", "2026-04-30"],
      );
      return r.rows;
    });
    expect(rows).toHaveLength(2);

    // Alice voit ses propres values
    expect(rows[0].athlete_id).toBe(1);
    expect((rows[0].fatigue_values as Array<unknown>).length).toBeGreaterThan(0);

    // Mais zéro fuite sur les values de Bob
    expect(rows[1].athlete_id).toBe(2);
    expect((rows[1].fatigue_values as Array<unknown>).length).toBe(0);
  });

  it("athlete sees their own values when querying their own id", async () => {
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<Row>(
        "SELECT athlete_id, fatigue_values FROM public.get_coach_kpis($1::int[], $2::date, $3::date)",
        [[1], "2026-04-01", "2026-04-30"],
      );
      return r.rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].athlete_id).toBe(1);
    const vals = (rows[0].fatigue_values as Array<string | number>).map(Number).sort();
    expect(vals).toEqual([5, 6]);
  });

  it("returns empty fatigue_values for an athlete with no sessions in the window", async () => {
    // Fenêtre passée hors seed → aucun match.
    const rows = await asUser(CAROL, async (c) => {
      const r = await c.query<Row>(
        "SELECT athlete_id, fatigue_values FROM public.get_coach_kpis($1::int[], $2::date, $3::date)",
        [[1, 2], "2025-01-01", "2025-12-31"],
      );
      return r.rows;
    });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect((row.fatigue_values as Array<unknown>).length).toBe(0);
    }
  });

  it("returns empty rows for non-existent athlete IDs (parity with JS null-handling)", async () => {
    // Un athlete_id qui n'existe pas en DB doit quand même apparaître (via unnest)
    // avec fatigue_values vide. Cohérent avec le contrat TS (Map.get → undefined → []).
    const rows = await asUser(CAROL, async (c) => {
      const r = await c.query<Row>(
        "SELECT athlete_id, fatigue_values FROM public.get_coach_kpis($1::int[], $2::date, $3::date)",
        [[9999], "2026-04-01", "2026-04-30"],
      );
      return r.rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].athlete_id).toBe(9999);
    expect((rows[0].fatigue_values as Array<unknown>).length).toBe(0);
  });

  it("empty athlete_ids array returns no rows", async () => {
    const rows = await asUser(CAROL, async (c) => {
      const r = await c.query<Row>(
        "SELECT athlete_id, fatigue_values FROM public.get_coach_kpis($1::int[], $2::date, $3::date)",
        [[], "2026-04-01", "2026-04-30"],
      );
      return r.rows;
    });
    expect(rows).toHaveLength(0);
  });

  it("uses fatigue column when set, falls back to rpe when fatigue is NULL", async () => {
    // Le seed a fatigue NULL pour toutes les sessions, donc le coalesce retourne rpe.
    // Vérifions le comportement quand fatigue est explicitement renseigné via une INSERT
    // tx-locale (rollback automatique en fin d'asUser).
    const rows = await asUser(CAROL, async (c) => {
      // Insert via service-role-equivalent dans la même transaction (Carol coach peut INSERT)
      await c.query(
        `INSERT INTO public.dim_sessions (athlete_id, athlete_name, session_date, time_slot, duration, rpe, fatigue)
         VALUES (1, 'Alice Athlete', '2026-04-15', 'morning', 60, 7, 9)`,
      );
      const r = await c.query<Row>(
        "SELECT athlete_id, fatigue_values FROM public.get_coach_kpis($1::int[], $2::date, $3::date)",
        [[1], "2026-04-15", "2026-04-15"],
      );
      return r.rows;
    });
    expect(rows).toHaveLength(1);
    const vals = (rows[0].fatigue_values as Array<string | number>).map(Number);
    // fatigue=9 utilisé (pas le rpe=7) car coalesce(fatigue, rpe) → 9
    expect(vals).toEqual([9]);
  });
});
