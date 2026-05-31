/**
 * RLS: RPC set_warmup_common_routine / set_warmup_activation_routine (§354)
 *
 * Setters atomiques (delete + insert) ajoutés par la migration prod
 * 00217_warmup_routine_setters.sql. Tous deux sont LANGUAGE sql en
 * SECURITY INVOKER (défaut) → les policies RLS écriture coach/admin des tables
 * warmup_common_routine (§351) / warmup_activation_routine (§352) s'appliquent :
 *   - coach  → l'INSERT passe WITH CHECK → la routine est remplacée.
 *   - athlete → l'INSERT viole WITH CHECK → erreur RLS, RPC entière échoue.
 *
 * Rappel harness : asUser() roule TOUJOURS la transaction en ROLLBACK. On vérifie
 * donc l'effet du coach DANS la transaction (les lignes remplacées sont visibles
 * sous son propre contexte RLS, ce qui prouve que WITH CHECK les a acceptées),
 * et pour le refus athlète on re-vérifie via asServiceRole que la VRAIE table
 * n'a pas bougé (piège §113 : un refus ne doit laisser aucune trace committée).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { asUser, asServiceRole, resetDb } from "./_helpers";

const ALICE = { appUserId: 1, appUserRole: "athlete" as const }; // nageur
const CAROL = { appUserId: 3, appUserRole: "coach" as const }; // coach

// Seed (voir seed.sql) :
//  - common  : 3 lignes (ordre 1,2,3 → exos 87/84/24)
//  - activation : 2 lignes (bucket upper_strength, ordre 1,2 → exos 87/84)
const COMMON_SEED_COUNT = 3;
const ACTIVATION_SEED_COUNT = 2;

async function commonRows() {
  return asServiceRole(async (db) => {
    const r = await db.query(
      "SELECT ordre, exercise_id FROM public.warmup_common_routine ORDER BY ordre",
    );
    return r.rows;
  });
}

async function activationRows(bucket: string) {
  return asServiceRole(async (db) => {
    const r = await db.query(
      "SELECT ordre, exercise_id FROM public.warmup_activation_routine WHERE bucket = $1 ORDER BY ordre",
      [bucket],
    );
    return r.rows;
  });
}

describe("RLS RPC set_warmup_* (§354)", () => {
  beforeAll(async () => {
    await resetDb();
  });

  // ── set_warmup_common_routine ─────────────────────────────────────────────
  it("coach CAN set_warmup_common_routine (routine remplacée)", async () => {
    const rows = await asUser(CAROL, async (db) => {
      await db.query("SELECT set_warmup_common_routine($1::int[])", [[24, 87]]);
      // Lecture DANS la transaction coach : si WITH CHECK avait refusé l'INSERT,
      // la RPC aurait throw. Les lignes visibles ici = preuve de l'acceptation.
      const r = await db.query(
        "SELECT ordre, exercise_id FROM public.warmup_common_routine ORDER BY ordre",
      );
      return r.rows;
    });
    // Setter common : ordre 0-based ((ord - 1)). Liste [24, 87] → (0,24),(1,87).
    expect(rows).toEqual([
      { ordre: 0, exercise_id: 24 },
      { ordre: 1, exercise_id: 87 },
    ]);
  });

  it("athlete CANNOT set_warmup_common_routine (RLS refuse → throw, table préservée)", async () => {
    await expect(
      asUser(ALICE, async (db) => {
        await db.query("SELECT set_warmup_common_routine($1::int[])", [[24]]);
      }),
    ).rejects.toThrow(/row-level security/i);
    // §113 : la vraie table reste le seed intact (aucune ligne fantôme committée).
    expect(await commonRows()).toEqual([
      { ordre: 1, exercise_id: 87 },
      { ordre: 2, exercise_id: 84 },
      { ordre: 3, exercise_id: 24 },
    ]);
  });

  // ── set_warmup_activation_routine ─────────────────────────────────────────
  it("coach CAN set_warmup_activation_routine (seau remplacé)", async () => {
    const rows = await asUser(CAROL, async (db) => {
      await db.query("SELECT set_warmup_activation_routine($1, $2::int[])", [
        "upper_strength",
        [84, 24, 87],
      ]);
      const r = await db.query(
        "SELECT ordre, exercise_id FROM public.warmup_activation_routine WHERE bucket = 'upper_strength' ORDER BY ordre",
      );
      return r.rows;
    });
    // Setter activation : ordre 1-based (ord). Liste [84,24,87] → (1,84),(2,24),(3,87).
    expect(rows).toEqual([
      { ordre: 1, exercise_id: 84 },
      { ordre: 2, exercise_id: 24 },
      { ordre: 3, exercise_id: 87 },
    ]);
  });

  it("athlete CANNOT set_warmup_activation_routine (RLS refuse → throw, table préservée)", async () => {
    await expect(
      asUser(ALICE, async (db) => {
        await db.query("SELECT set_warmup_activation_routine($1, $2::int[])", [
          "upper_strength",
          [24],
        ]);
      }),
    ).rejects.toThrow(/row-level security/i);
    // §113 : seau upper_strength inchangé (seed 2 lignes).
    expect(await activationRows("upper_strength")).toEqual([
      { ordre: 1, exercise_id: 87 },
      { ordre: 2, exercise_id: 84 },
    ]);
  });

  it("(garde-fou) seed total inchangé après les refus athlète", async () => {
    const totals = await asServiceRole(async (db) => {
      const c = await db.query(
        "SELECT count(*)::int AS c FROM public.warmup_common_routine",
      );
      const a = await db.query(
        "SELECT count(*)::int AS c FROM public.warmup_activation_routine",
      );
      return { common: c.rows[0].c as number, activation: a.rows[0].c as number };
    });
    expect(totals.common).toBe(COMMON_SEED_COUNT);
    expect(totals.activation).toBe(ACTIVATION_SEED_COUNT);
  });
});
