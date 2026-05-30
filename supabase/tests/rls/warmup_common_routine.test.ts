/**
 * RLS: public.warmup_common_routine
 *
 * Coverage for §351 — routine articulaire commune (échauffement intelligent).
 * Migration prod 00214_warmup_intelligent.sql. 2 policies :
 *   - read  (SELECT) : tout rôle authentifié     → USING (app_user_role() IS NOT NULL)
 *   - write (ALL)    : coach/admin uniquement     → USING/CHECK app_user_role() IN ('coach','admin')
 *
 * Pièges §113 couverts : pour chaque écriture interdite côté athlète, on assert
 * RLS error OU 0 rows affected, ET on vérifie via asServiceRole que la table
 * réelle n'a pas bougé (le seed reste = 3 lignes) — un DELETE/UPDATE no-op
 * silencieux ne doit pas passer pour un succès.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { asUser, asServiceRole, resetDb } from "./_helpers";

const ALICE = { appUserId: 1, appUserRole: "athlete" as const }; // nageur
const CAROL = { appUserId: 3, appUserRole: "coach" as const };   // coach
const DIANA = { appUserId: 4, appUserRole: "admin" as const };   // admin

const SEED_COUNT = 3; // 3 lignes seedées (ordre 1,2,3 → exos 87/84/24)

async function totalRows(): Promise<number> {
  return asServiceRole(async (db) => {
    const r = await db.query(
      "SELECT count(*)::int AS c FROM public.warmup_common_routine",
    );
    return r.rows[0].c as number;
  });
}

describe("RLS warmup_common_routine", () => {
  // Toutes les écritures de ce fichier passent par asUser → transaction
  // ROLLBACK systématique. Rien ne persiste : le seed (3 lignes) reste stable
  // entre tests, pas besoin de re-seed. Les checks asServiceRole vérifient donc
  // bien que les écritures REFUSÉES n'ont laissé aucune trace.
  beforeAll(async () => {
    await resetDb();
  });

  // ── READ : tout rôle authentifié peut lire ───────────────────────────────
  it("athlete CAN SELECT (lecture authentifiée OK)", async () => {
    const rows = await asUser(ALICE, async (db) => {
      const r = await db.query(
        "SELECT ordre, exercise_id FROM public.warmup_common_routine ORDER BY ordre",
      );
      return r.rows;
    });
    expect(rows).toEqual([
      { ordre: 1, exercise_id: 87 },
      { ordre: 2, exercise_id: 84 },
      { ordre: 3, exercise_id: 24 },
    ]);
  });

  it("coach CAN SELECT", async () => {
    const count = await asUser(CAROL, async (db) => {
      const r = await db.query(
        "SELECT count(*)::int AS c FROM public.warmup_common_routine",
      );
      return r.rows[0].c as number;
    });
    expect(count).toBe(SEED_COUNT);
  });

  // ── WRITE refusé pour l'athlète ───────────────────────────────────────────
  it("athlete CANNOT INSERT (WITH CHECK refuse → RLS error)", async () => {
    await expect(
      asUser(ALICE, async (db) => {
        await db.query(
          "INSERT INTO public.warmup_common_routine (ordre, exercise_id) VALUES (4, 24)",
        );
      }),
    ).rejects.toThrow(/row-level security/i);
    // Table réelle inchangée (l'INSERT était de toute façon en transaction rollback,
    // mais on vérifie qu'aucune ligne fantôme n'a été committée).
    expect(await totalRows()).toBe(SEED_COUNT);
  });

  it("athlete CANNOT UPDATE (no-op silencieux → 0 rows, table préservée)", async () => {
    await asUser(ALICE, async (db) => {
      const r = await db.query(
        "UPDATE public.warmup_common_routine SET ordre = 99 WHERE id = 1",
      );
      // USING filtre toutes les lignes pour l'athlète → 0 affectée, pas d'erreur.
      expect(r.rowCount).toBe(0);
    });
    // Aucune ligne modifiée dans la vraie table.
    const ordre = await asServiceRole(async (db) => {
      const r = await db.query(
        "SELECT ordre FROM public.warmup_common_routine WHERE id = 1",
      );
      return r.rows[0].ordre as number;
    });
    expect(ordre).toBe(1);
  });

  it("athlete CANNOT DELETE (no-op silencieux → 0 rows, table préservée)", async () => {
    await asUser(ALICE, async (db) => {
      const r = await db.query("DELETE FROM public.warmup_common_routine");
      // RLS filtre tout → 0 lignes supprimées, pas d'erreur (piège §113).
      expect(r.rowCount).toBe(0);
    });
    expect(await totalRows()).toBe(SEED_COUNT);
  });

  // ── WRITE autorisé pour le coach ──────────────────────────────────────────
  it("coach CAN INSERT", async () => {
    // asUser rollback systématiquement : on assert sur le RETURNING (la row
    // a bien été acceptée par WITH CHECK), pas sur le state persisté.
    const rowCount = await asUser(CAROL, async (db) => {
      const r = await db.query(
        "INSERT INTO public.warmup_common_routine (ordre, exercise_id) VALUES (4, 24) RETURNING id",
      );
      return r.rowCount;
    });
    expect(rowCount).toBe(1);
  });

  it("coach CAN UPDATE", async () => {
    const rowCount = await asUser(CAROL, async (db) => {
      const r = await db.query(
        "UPDATE public.warmup_common_routine SET ordre = 10 WHERE id = 1",
      );
      return r.rowCount;
    });
    expect(rowCount).toBe(1);
  });

  it("coach CAN DELETE", async () => {
    const rowCount = await asUser(CAROL, async (db) => {
      const r = await db.query(
        "DELETE FROM public.warmup_common_routine WHERE id = 1",
      );
      return r.rowCount;
    });
    expect(rowCount).toBe(1);
  });

  it("admin CAN INSERT (write coach/admin)", async () => {
    const rowCount = await asUser(DIANA, async (db) => {
      const r = await db.query(
        "INSERT INTO public.warmup_common_routine (ordre, exercise_id) VALUES (5, 87) RETURNING id",
      );
      return r.rowCount;
    });
    expect(rowCount).toBe(1);
  });
});
