# Audit robustesse infrastructure — Plan d'implémentation des correctifs

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Corriger les fuites RLS, les pertes de données silencieuses et les races auth/PWA identifiées par l'audit du 2026-04-26 sur les couches transversales (auth/session, offline queue, RLS, atomicité DB, PWA).

**Architecture:** Mix de migrations SQL (durcissement policies + RPC), modifications TS ciblées (offline queue, auth, vite.config), et extension des tests RLS existants. Aucun changement métier. Toutes les migrations passent par `mcp__plugin_supabase_supabase__apply_migration` (cf. CLAUDE.md § Migrations Supabase). Tests Vitest pour le code TS, harness `supabase/tests/rls/` pour les RLS.

**Tech Stack:** TypeScript, React 19, Vitest, Supabase Postgres + RLS, Workbox/vite-plugin-pwa, MCP Supabase.

**Audit source:** rapport conversationnel du 2026-04-26 — Top 3 P0 :
1. Cross-coach assignment hijack (`assignments_write` jamais durcie)
2. Set perdu sur quota localStorage saturé (`enqueue` sans try/catch)
3. NetworkFirst sur `/auth/*` (cache JWT possible)

**Chantier ROADMAP:** §171 — à logger dans `docs/implementation-log.md` au fil des phases.

**Branche:** travailler dans un **worktree dédié** (`.claude/worktrees/audit-robustness-§171`) — créer via `git worktree add` avant la 1re task. Ne PAS travailler directement sur `main` car les migrations RLS sont irréversibles en cas de rollback partiel.

---

## Pré-requis avant d'attaquer

1. Lire l'audit qui précède ce plan (rapport en tête de la conversation).
2. Lire CLAUDE.md sections « Migrations Supabase », « Déploiement », « Tests RLS intégration », « Économie de tokens ».
3. Vérifier la dernière migration : `ls supabase/migrations/ | tail -1` → la 1re nouvelle sera `00145_*.sql`.
4. Vérifier que Docker est lancé pour les tests RLS : `docker ps`. Si non, demander à l'utilisateur. Puis `supabase start` une seule fois.
5. Lire `docs/rls-testing.md` § « Ajouter un test » avant de toucher au harness.
6. **Avant chaque commit** : `npm test -- <fichier>` puis `npx tsc --noEmit`. Pour les tasks RLS : `npm run test:rls -- <fichier>`.

---

# PHASE 1 — Fixes P0 (sécurité critique + perte de données)

Objectif : neutraliser les vulnérabilités exploitables et la perte de données silencieuse en < 1 jour de dev. Chaque task est indépendante et peut être commitée seule.

## Task 1 — Migration : durcir `session_assignments` cross-coach

**Files:**
- Create: `supabase/migrations/00145_assignments_write_ownership.sql`

**Contexte:** la policy `assignments_write FOR ALL USING (app_user_role() IN ('admin','coach'))` autorise n'importe quel coach à `UPDATE`/`DELETE` les assignations d'un autre coach. À durcir comme §102 sur `training_slots`.

**Step 1: Écrire la migration**

```sql
-- 00145_assignments_write_ownership.sql
-- §171 audit P0 #1: prevent cross-coach mutation of session_assignments.
--
-- The historical `assignments_write FOR ALL` (00001) granted any coach the
-- right to UPDATE/DELETE any assignment, including those created by a
-- different coach. This migration splits the write policy into INSERT
-- (any coach/admin), UPDATE/DELETE (admin OR coach owner via assigned_by).
--
-- Mirrors the §102 pattern on training_slots.

BEGIN;

DROP POLICY IF EXISTS assignments_write ON session_assignments;

CREATE POLICY assignments_insert ON session_assignments
  FOR INSERT TO authenticated
  WITH CHECK (app_user_role() IN ('admin', 'coach'));

CREATE POLICY assignments_update ON session_assignments
  FOR UPDATE TO authenticated
  USING (
    app_user_role() = 'admin'
    OR (app_user_role() = 'coach' AND assigned_by = app_user_id())
  )
  WITH CHECK (
    app_user_role() = 'admin'
    OR (app_user_role() = 'coach' AND assigned_by = app_user_id())
  );

CREATE POLICY assignments_delete ON session_assignments
  FOR DELETE TO authenticated
  USING (
    app_user_role() = 'admin'
    OR (app_user_role() = 'coach' AND assigned_by = app_user_id())
  );

COMMIT;
```

**Step 2: Appliquer via MCP**

Utiliser `mcp__plugin_supabase_supabase__apply_migration` avec `name = "00145_assignments_write_ownership"` et le contenu SQL ci-dessus. Vérifier la réponse `success: true`.

**Step 3: Vérifier en prod (read-only)**

```sql
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr
  FROM pg_policy
 WHERE polrelid = 'session_assignments'::regclass;
```

Lancer via `mcp__plugin_supabase_supabase__execute_sql`. Expected: 4 lignes (`assignments_select`, `assignments_insert`, `assignments_update`, `assignments_delete`), aucune avec polname `assignments_write`.

**Step 4: Commit**

```bash
git add supabase/migrations/00145_assignments_write_ownership.sql
git commit -m "fix(rls): §171 — durcir session_assignments cross-coach UPDATE/DELETE"
```

---

## Task 2 — Test RLS : cross-coach `session_assignments`

**Files:**
- Modify: `supabase/tests/seed.sql` (ajouter assignations Eve pour le matrice cross-coach)
- Modify: `supabase/tests/schema.sql` (répliquer la migration 00145)
- Create: `supabase/tests/rls/session_assignments_cross_coach.test.ts`

**Step 1: Vérifier le schéma de test**

Lire `supabase/tests/schema.sql` et chercher `assignments_write`. Si présent, le remplacer par les 3 nouvelles policies (insert/update/delete) du Task 1. Si déjà aligné via re-application, sauter.

**Step 2: Étendre `seed.sql`**

Localiser le bloc `INSERT INTO public.session_assignments (...) VALUES` autour de la ligne 60. Ajouter une ligne `(6)` créée par Eve (id=5) :

```sql
-- sa6: created by Eve (coach id=5), direct target Bob — used by cross-coach tests
INSERT INTO public.session_assignments (id, assignment_type, target_user_id, target_group_id, assigned_by, scheduled_date, visible_from) VALUES
  (6, 'swim', 2, NULL, 5, '2026-04-06', NULL);
```

⚠️ Lire `session_assignments.test.ts:140` (« Alice sees exactly sa1 + sa3 ») et `session_assignments.test.ts:133` (« admin sees all 5 ») — les valeurs hardcodées doivent rester valides. Bob est dans Juniors mais pas dans Cadets ; Alice ne voit pas sa6 (target=Bob). Le seed actuel `Carol` voit sa1-sa5 via `assigned_by=3`, donc add sa6 ne casse pas. **Mais** « admin sees all 5 » devient « all 6 » → mettre à jour le test existant.

**Step 3: Écrire les tests**

```ts
// supabase/tests/rls/session_assignments_cross_coach.test.ts
//
// §171 audit P0 #1 — locker la policy `assignments_update` / `assignments_delete`
// qui restreint un coach à ses propres assignations (assigned_by = app_user_id()).
//
// Fixture: sa5 créée par Carol (id=3), sa6 créée par Eve (id=5).
import { describe, it, expect, beforeAll } from "vitest";
import { asUser, resetDb } from "./_helpers";

const CAROL = { appUserId: 3, appUserRole: "coach" as const };
const EVE   = { appUserId: 5, appUserRole: "coach" as const };
const DIANA = { appUserId: 4, appUserRole: "admin" as const };

beforeAll(async () => {
  await resetDb();
});

describe("session_assignments cross-coach hardening (§171)", () => {
  it("Eve CANNOT update Carol's sa5", async () => {
    const updated = await asUser(EVE, async (c) => {
      const r = await c.query<{ id: number }>(
        "UPDATE session_assignments SET scheduled_date = '2099-01-01' WHERE id = 5 RETURNING id",
      );
      return r.rows;
    });
    expect(updated).toEqual([]);
  });

  it("Eve CANNOT delete Carol's sa5", async () => {
    const deleted = await asUser(EVE, async (c) => {
      const r = await c.query<{ id: number }>(
        "DELETE FROM session_assignments WHERE id = 5 RETURNING id",
      );
      return r.rows;
    });
    expect(deleted).toEqual([]);
  });

  it("Carol CAN update her own sa5", async () => {
    const updated = await asUser(CAROL, async (c) => {
      const r = await c.query<{ id: number }>(
        "UPDATE session_assignments SET scheduled_date = '2026-05-01' WHERE id = 5 RETURNING id",
      );
      return r.rows;
    });
    expect(updated).toEqual([{ id: 5 }]);
  });

  it("Eve CAN update her own sa6", async () => {
    const updated = await asUser(EVE, async (c) => {
      const r = await c.query<{ id: number }>(
        "UPDATE session_assignments SET scheduled_date = '2026-05-02' WHERE id = 6 RETURNING id",
      );
      return r.rows;
    });
    expect(updated).toEqual([{ id: 6 }]);
  });

  it("Admin CAN update / delete any assignment regardless of assigned_by", async () => {
    const updated = await asUser(DIANA, async (c) => {
      const r = await c.query<{ id: number }>(
        "UPDATE session_assignments SET scheduled_date = '2026-05-03' WHERE id = 5 RETURNING id",
      );
      return r.rows;
    });
    expect(updated).toEqual([{ id: 5 }]);
  });

  it("Coach INSERT still allowed (assigned_by free-form on insert)", async () => {
    const inserted = await asUser(EVE, async (c) => {
      const r = await c.query<{ id: number }>(
        `INSERT INTO session_assignments (assignment_type, target_user_id, assigned_by, scheduled_date)
           VALUES ('swim', 2, 5, '2026-05-04') RETURNING id`,
      );
      return r.rows;
    });
    expect(inserted).toHaveLength(1);
  });
});
```

**Step 4: Mettre à jour le test existant (admin sees all)**

Dans `supabase/tests/rls/session_assignments.test.ts:140` (« admin sees all 5 »), remplacer `5` par `6`. Vérifier qu'aucun autre test ne hardcode une valeur qui dépend du nombre total.

**Step 5: Run**

```bash
npm run test:rls -- session_assignments_cross_coach
npm run test:rls -- session_assignments
```

Expected: 6 tests cross-coach pass + tous les tests existants pass.

**Step 6: Commit**

```bash
git add supabase/tests/seed.sql supabase/tests/schema.sql \
        supabase/tests/rls/session_assignments_cross_coach.test.ts \
        supabase/tests/rls/session_assignments.test.ts
git commit -m "test(rls): §171 — couverture cross-coach session_assignments"
```

---

## Task 3 — Migration : authz `assignment_id` dans `save_strength_run_atomic`

**Files:**
- Create: `supabase/migrations/00146_save_strength_run_assignment_authz.sql`

**Contexte:** le RPC SECURITY DEFINER bypass les RLS et exécute `UPDATE session_assignments SET status='completed' WHERE id = (p_data->>'assignment_id')::int` sans vérifier que l'assignation cible bien le caller. Combiné au P0 #1 (avant fix), ça permet de marquer terminée n'importe quelle séance d'un autre nageur.

**Step 1: Écrire la migration**

```sql
-- 00146_save_strength_run_assignment_authz.sql
-- §171 audit P0/P1 #5: prevent forged assignment_id in save_strength_run_atomic.
--
-- The SECURITY DEFINER RPC was unconditionally updating session_assignments
-- by id, which (combined with the assignments_write hole pre-§171) allowed a
-- malicious coach to mark another coach's assignment "completed". This patch
-- adds an explicit check: the assignment must target v_target_athlete_id,
-- OR caller is admin.

CREATE OR REPLACE FUNCTION public.save_strength_run_atomic(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id int;
  v_logs_count int;
  v_1rm_count int := 0;
  v_assignment_updated boolean := false;
  v_caller_id int;
  v_caller_role text;
  v_target_athlete_id int;
  v_assignment_id int;
  v_assignment_target int;
BEGIN
  v_caller_id := app_user_id();
  v_caller_role := app_user_role();
  v_target_athlete_id := (p_data->>'athlete_id')::int;

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF v_target_athlete_id IS NULL THEN
    RAISE EXCEPTION 'athlete_id is required' USING ERRCODE = '22023';
  END IF;

  IF v_target_athlete_id <> v_caller_id
     AND v_caller_role NOT IN ('coach', 'admin') THEN
    RAISE EXCEPTION 'forbidden: cannot save run for another athlete' USING ERRCODE = '42501';
  END IF;

  INSERT INTO strength_session_runs (
    session_id, athlete_id, assignment_id, started_at, completed_at,
    status, fatigue, comments
  ) VALUES (
    (p_data->>'session_id')::int,
    v_target_athlete_id,
    NULLIF(p_data->>'assignment_id', '')::int,
    COALESCE((p_data->>'started_at')::timestamptz, now()),
    now(),
    'completed',
    NULLIF(p_data->>'fatigue', '')::int,
    NULLIF(p_data->>'comments', '')
  ) RETURNING id INTO v_run_id;

  INSERT INTO strength_set_logs (
    run_id, exercise_id, set_index, reps, weight, difficulty, completed_at, notes
  )
  SELECT
    v_run_id,
    (log->>'exercise_id')::int,
    COALESCE((log->>'set_index')::int, (log->>'set_number')::int),
    (log->>'reps')::int,
    COALESCE((log->>'weight')::numeric, 0),
    NULLIF(log->>'difficulty', '')::int,
    COALESCE((log->>'completed_at')::timestamptz, now()),
    NULLIF(log->>'notes', '')
  FROM jsonb_array_elements(p_data->'logs') AS log;
  GET DIAGNOSTICS v_logs_count = ROW_COUNT;

  IF p_data->'one_rm_estimates' IS NOT NULL
     AND jsonb_typeof(p_data->'one_rm_estimates') = 'array'
     AND jsonb_array_length(p_data->'one_rm_estimates') > 0
  THEN
    INSERT INTO one_rm_records (athlete_id, exercise_id, one_rm, source_run_id, recorded_at)
    SELECT
      COALESCE(NULLIF(r->>'athlete_id', '')::int, v_target_athlete_id),
      (r->>'exercise_id')::int,
      COALESCE((r->>'weight')::numeric, (r->>'one_rm')::numeric),
      v_run_id,
      now()
    FROM jsonb_array_elements(p_data->'one_rm_estimates') AS r
    WHERE COALESCE((r->>'weight')::numeric, (r->>'one_rm')::numeric) IS NOT NULL
    ON CONFLICT (athlete_id, exercise_id) DO UPDATE SET
      one_rm = EXCLUDED.one_rm,
      source_run_id = EXCLUDED.source_run_id,
      recorded_at = EXCLUDED.recorded_at;
    GET DIAGNOSTICS v_1rm_count = ROW_COUNT;
  END IF;

  -- §171 P0/P1 #5: assignment_id must target this athlete (or caller=admin)
  v_assignment_id := NULLIF(p_data->>'assignment_id', '')::int;
  IF v_assignment_id IS NOT NULL THEN
    SELECT target_user_id INTO v_assignment_target
      FROM session_assignments
     WHERE id = v_assignment_id;

    IF v_assignment_target IS NULL THEN
      -- Group-targeted or unknown: only admin/coach may mark completed
      IF v_caller_role NOT IN ('coach', 'admin') THEN
        RAISE EXCEPTION 'forbidden: cannot mark non-direct assignment completed'
          USING ERRCODE = '42501';
      END IF;
    ELSIF v_assignment_target <> v_target_athlete_id
          AND v_caller_role <> 'admin' THEN
      RAISE EXCEPTION 'forbidden: assignment % does not target athlete %',
        v_assignment_id, v_target_athlete_id USING ERRCODE = '42501';
    END IF;

    UPDATE session_assignments SET status = 'completed'
     WHERE id = v_assignment_id;
    v_assignment_updated := FOUND;
  END IF;

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'logs_count', v_logs_count,
    'one_rm_count', v_1rm_count,
    'assignment_updated', v_assignment_updated
  );
END;
$$;
```

**Step 2: Appliquer via MCP**

Idem Task 1, name `00146_save_strength_run_assignment_authz`.

**Step 3: Vérifier la signature**

```sql
SELECT pg_get_functiondef('public.save_strength_run_atomic(jsonb)'::regprocedure);
```

Expected: la nouvelle définition contient `RAISE EXCEPTION 'forbidden: assignment'`.

**Step 4: Commit**

```bash
git add supabase/migrations/00146_save_strength_run_assignment_authz.sql
git commit -m "fix(rpc): §171 — authz assignment_id dans save_strength_run_atomic"
```

---

## Task 4 — Test RPC : refus assignation cross-athlete

**Files:**
- Modify: `supabase/tests/schema.sql` (refléter la migration 00146)
- Create: `supabase/tests/rls/save_strength_run_atomic.test.ts`

**Step 1: Mettre à jour `schema.sql`**

Si `save_strength_run_atomic` est dans `schema.sql`, remplacer le corps. Sinon ajouter le contenu de la migration 00146 à la fin de `schema.sql` (sous une section « Atomic RPCs »).

**Step 2: Écrire le test**

```ts
// supabase/tests/rls/save_strength_run_atomic.test.ts
// §171 P0/P1 #5 — assignment_id doit cibler l'athlète, sinon le RPC refuse.
import { describe, it, expect, beforeAll } from "vitest";
import { asUser, resetDb, asServiceRole } from "./_helpers";

const ALICE = { appUserId: 1, appUserRole: "athlete" as const };
const BOB   = { appUserId: 2, appUserRole: "athlete" as const };
const CAROL = { appUserId: 3, appUserRole: "coach" as const };

beforeAll(async () => {
  await resetDb();
  // sa1 cible Alice (target_user_id=1, assigned_by Carol). On utilise sa1 pour Alice
  // et on tentera Bob de l'usurper.
});

describe("save_strength_run_atomic — assignment authz (§171)", () => {
  it("Bob CANNOT save a run with Alice's assignment_id (sa1)", async () => {
    await expect(
      asUser(BOB, async (c) => {
        await c.query(`SELECT save_strength_run_atomic($1::jsonb)`, [
          JSON.stringify({
            athlete_id: 2,
            assignment_id: 1,
            started_at: new Date().toISOString(),
            logs: [],
            one_rm_estimates: [],
          }),
        ]);
      }),
    ).rejects.toThrow(/forbidden: assignment/);
  });

  it("Alice CAN save a run with her own assignment_id", async () => {
    const result = await asUser(ALICE, async (c) => {
      const r = await c.query<{ assignment_updated: boolean }>(
        `SELECT (save_strength_run_atomic($1::jsonb)->>'assignment_updated')::bool AS assignment_updated`,
        [
          JSON.stringify({
            athlete_id: 1,
            assignment_id: 1,
            started_at: new Date().toISOString(),
            logs: [],
            one_rm_estimates: [],
          }),
        ],
      );
      return r.rows[0];
    });
    expect(result.assignment_updated).toBe(true);
  });

  it("Coach CAN save a run for an athlete with that athlete's assignment", async () => {
    const result = await asUser(CAROL, async (c) => {
      const r = await c.query<{ assignment_updated: boolean }>(
        `SELECT (save_strength_run_atomic($1::jsonb)->>'assignment_updated')::bool AS assignment_updated`,
        [
          JSON.stringify({
            athlete_id: 1,
            assignment_id: 1,
            started_at: new Date().toISOString(),
            logs: [],
            one_rm_estimates: [],
          }),
        ],
      );
      return r.rows[0];
    });
    expect(result.assignment_updated).toBe(true);
  });
});
```

**Step 3: Run**

```bash
npm run test:rls -- save_strength_run_atomic
```

Expected: 3 tests pass.

**Step 4: Commit**

```bash
git add supabase/tests/schema.sql supabase/tests/rls/save_strength_run_atomic.test.ts
git commit -m "test(rpc): §171 — couverture assignment authz save_strength_run_atomic"
```

---

## Task 5 — Offline queue : gestion `QuotaExceededError`

**Files:**
- Modify: `src/lib/offlineQueue.ts:22-33`
- Modify: `src/lib/api/localStorage.ts:18-24`
- Create: `src/lib/__tests__/offlineQueue.test.ts`

**Step 1: Écrire le test (qui doit échouer)**

```ts
// src/lib/__tests__/offlineQueue.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  enqueue,
  getQueue,
  clearQueue,
  markRetry,
  MAX_RETRY_ATTEMPTS,
  QUEUE_UPDATED_EVENT,
} from "@/lib/offlineQueue";

describe("offlineQueue.enqueue", () => {
  beforeEach(() => {
    clearQueue();
  });

  it("enqueues an item and dispatches QUEUE_UPDATED_EVENT", () => {
    const handler = vi.fn();
    window.addEventListener(QUEUE_UPDATED_EVENT, handler);
    enqueue("test", { foo: "bar" });
    expect(getQueue()).toHaveLength(1);
    expect(handler).toHaveBeenCalledOnce();
    window.removeEventListener(QUEUE_UPDATED_EVENT, handler);
  });

  it("preserves FIFO order across multiple enqueues", () => {
    enqueue("first", { idx: 1 });
    enqueue("second", { idx: 2 });
    enqueue("third", { idx: 3 });
    const queue = getQueue();
    expect(queue.map((q) => q.payload.idx)).toEqual([1, 2, 3]);
  });

  it("throws a typed QuotaError when localStorage is full", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = vi.fn(() => {
      const err = new Error("QuotaExceededError") as Error & { name: string };
      err.name = "QuotaExceededError";
      throw err;
    });
    try {
      expect(() => enqueue("overflow", { x: 1 })).toThrow(/quota|storage full/i);
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it("does NOT dispatch the event when persist fails", () => {
    const handler = vi.fn();
    window.addEventListener(QUEUE_UPDATED_EVENT, handler);
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = vi.fn(() => {
      const err = new Error("QuotaExceededError") as Error & { name: string };
      err.name = "QuotaExceededError";
      throw err;
    });
    try {
      try { enqueue("overflow", {}); } catch { /* expected */ }
      expect(handler).not.toHaveBeenCalled();
    } finally {
      Storage.prototype.setItem = original;
      window.removeEventListener(QUEUE_UPDATED_EVENT, handler);
    }
  });
});

describe("offlineQueue.markRetry / poisoning", () => {
  beforeEach(() => clearQueue());

  it("drops an item after MAX_RETRY_ATTEMPTS", () => {
    enqueue("flaky", {});
    const id = getQueue()[0].id;
    for (let i = 0; i < MAX_RETRY_ATTEMPTS - 1; i++) {
      expect(markRetry(id)).toBe(false);
    }
    expect(markRetry(id)).toBe(true);
    expect(getQueue()).toHaveLength(0);
  });
});
```

**Step 2: Run le test (doit échouer sur `QuotaError`)**

```bash
npm test -- offlineQueue
```

Expected: 1 test fail (`throws a typed QuotaError`).

**Step 3: Implémenter le fix dans `offlineQueue.ts`**

Remplacer la fonction `enqueue` (lignes 22-33) par :

```ts
/** Thrown when localStorage rejects a write — typically iOS Safari quota. */
export class OfflineQueueQuotaError extends Error {
  constructor(cause: unknown) {
    super("Offline storage full — please reconnect to free space");
    this.name = "OfflineQueueQuotaError";
    if (cause instanceof Error) this.stack = cause.stack;
  }
}

export function enqueue(type: string, payload: Record<string, unknown>) {
  const queue = getQueue();
  queue.push({
    id: crypto.randomUUID(),
    type,
    payload,
    timestamp: Date.now(),
    retryCount: 0,
  });
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    // Best-effort: drop the catalog mirror (largest non-essential entry) and retry once.
    try {
      localStorage.removeItem("suivi_natation_exercises");
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (retryErr) {
      console.error("[offline-queue] enqueue persist failed", retryErr);
      throw new OfflineQueueQuotaError(retryErr);
    }
  }
  window.dispatchEvent(new CustomEvent(QUEUE_UPDATED_EVENT));
}
```

**Step 4: Run le test (doit passer)**

```bash
npm test -- offlineQueue
```

Expected: 5 tests pass.

**Step 5: Couvrir l'appelant — `Strength.tsx`**

Lire `src/pages/Strength.tsx:738-773`. Wrapper les 4 appels `enqueue("strength-set-log", ...)` et `enqueue("strength-run-completed", ...)` (lignes 740, 770, 810, 837) dans un `try/catch` :

```ts
try {
  enqueue("strength-set-log", { ... } as Record<string, unknown>);
} catch (err) {
  toast({
    title: "Mémoire pleine",
    description: "Reconnecte-toi au réseau pour libérer l'espace de stockage.",
    variant: "destructive",
  });
  // Re-jeter pour que le composant n'avance pas comme si le set était sauvegardé
  throw err;
}
```

Pour les 2 appels dans le `onFinish` (lignes 810, 837), même pattern mais sans `throw` (l'utilisateur termine déjà). Toast destructif + ne pas naviguer vers `summary` :

```ts
try {
  enqueue("strength-run-completed", offlinePayload as Record<string, unknown>);
  toast({ title: "Séance sauvegardée hors-ligne", description: "Sera synchronisée au retour du réseau." });
  setScreenMode("summary");
} catch {
  toast({
    title: "Mémoire pleine",
    description: "Impossible d'enregistrer la séance hors-ligne. Reconnecte-toi au réseau.",
    variant: "destructive",
  });
  // Garder l'écran focus pour permettre une retry après vidage manuel
}
```

**Step 6: Commit**

```bash
git add src/lib/offlineQueue.ts src/lib/__tests__/offlineQueue.test.ts src/pages/Strength.tsx
git commit -m "fix(offline): §171 P0 #2 — gestion QuotaExceeded sur enqueue + UI signal"
```

---

## Task 6 — PWA : retirer NetworkFirst sur `/auth/*`

**Files:**
- Modify: `vite.config.ts:76-85`

**Contexte:** mettre en cache les réponses Auth peut servir un ancien JWT depuis le SW si Supabase devient temporairement indisponible. Plus simple : exclure complètement `/auth/*` du SW.

**Step 1: Modifier `vite.config.ts`**

Supprimer le bloc `runtimeCaching` `supabase-auth` (lignes 76-85). Ajouter en remplacement une règle `NetworkOnly` explicite pour bien documenter l'intention :

```ts
{
  urlPattern: /^https:\/\/.*\.supabase\.co\/auth\/.*/i,
  handler: 'NetworkOnly',
  options: {
    cacheName: 'supabase-auth-no-cache',
  },
},
```

Cela garantit que le SW ne mettra jamais en cache, mais la règle reste explicite (en cas de futur dev qui voudrait remettre `NetworkFirst`, le diff sera évident).

**Step 2: Vérifier le build**

```bash
npm run build
```

Expected: `dist/sw.js` généré sans erreur. Inspecter `dist/sw.js` :

```bash
grep -c "supabase-auth-no-cache" dist/sw.js
```

Expected: ≥ 1.

**Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "fix(pwa): §171 P0 #4 — NetworkOnly sur /auth/* (no JWT caching)"
```

---

# PHASE 2 — Fixes P1 (auth & offline robustness)

## Task 7 — Auth : ne pas déconnecter si `INITIAL_SESSION` arrive avec session=null

**Files:**
- Modify: `src/lib/auth.ts:382-393`
- Create: `src/lib/__tests__/auth-state.test.ts`

**Contexte:** Sur iOS PWA, le retour de background peut faire arriver un `INITIAL_SESSION` avec `session=null` avant que GoTrue ait fini de réhydrater depuis le storage. Le code actuel reset le store → utilisateur déconnecté à tort.

**Step 1: Écrire le test**

```ts
// src/lib/__tests__/auth-state.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAuth } from "@/lib/auth";

describe("auth — onAuthStateChange edge cases", () => {
  beforeEach(() => {
    useAuth.setState({
      user: "Alice",
      userId: 1,
      role: "athlete",
      isLoaded: true,
      accessToken: "tok",
      refreshToken: "ref",
    });
    localStorage.clear();
  });

  it("does NOT logout if INITIAL_SESSION arrives null AND a Supabase token is in localStorage", () => {
    localStorage.setItem("sb-fscnobivsgornxdwqwlk-auth-token", JSON.stringify({ access_token: "x" }));
    // Simulate: import auth.ts triggers onAuthStateChange registration; we'll trigger via the
    // exported handler if one is exposed, otherwise just call the handler manually after refactor.
    // (See impl: ensure the null-session branch is gated by the localStorage check.)
    // Placeholder assertion: store still has user
    expect(useAuth.getState().user).toBe("Alice");
  });
});
```

⚠️ Le test ci-dessus est partiel — pour le rendre executable il faut exposer le handler `onAuthStateChange` ou ajouter un wrapper testable. **Approche pragmatique** : extraire la logique du callback dans une fonction nommée `handleAuthEvent(event, session)` exportée pour les tests.

**Step 2: Refactoriser `auth.ts:331-394`**

Extraire la logique :

```ts
export function handleAuthEvent(event: string, session: Session | null) {
  if (event === "TOKEN_REFRESHED" && session) { /* idem */ return; }
  if (event === "SIGNED_OUT") { /* idem */ return; }

  if (session) {
    /* idem */ return;
  }

  // §171 P1 — INITIAL_SESSION/null may arrive transiently on iOS PWA wake-up.
  // If a Supabase token is still in localStorage, swallow the null and wait for
  // the next event (TOKEN_REFRESHED or a real SIGNED_OUT). This prevents a
  // spurious logout when the user resumes the app.
  if (event === "INITIAL_SESSION" && hasStoredSupabaseToken()) {
    console.warn("[auth] INITIAL_SESSION arrived with null session but token present — ignoring");
    return;
  }

  useAuth.setState({
    user: null,
    userId: null,
    role: null,
    isApproved: null,
    approvalStatus: "not_required",
    isLoaded: true,
    accessToken: null,
    refreshToken: null,
  });
}

function hasStoredSupabaseToken(): boolean {
  if (typeof window === "undefined") return false;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith("sb-") && key.endsWith("-auth-token")) {
        const raw = window.localStorage.getItem(key);
        if (raw && raw !== "null") return true;
      }
    }
  } catch { /* private mode */ }
  return false;
}

supabase.auth.onAuthStateChange((event, session) => handleAuthEvent(event, session));
```

**Step 3: Compléter le test**

```ts
import { handleAuthEvent } from "@/lib/auth";

it("does NOT logout if INITIAL_SESSION/null arrives with stored Supabase token", () => {
  localStorage.setItem("sb-fscnobivsgornxdwqwlk-auth-token", JSON.stringify({ access_token: "x" }));
  handleAuthEvent("INITIAL_SESSION", null);
  expect(useAuth.getState().user).toBe("Alice");
});

it("DOES logout if INITIAL_SESSION/null arrives without any stored token", () => {
  // Note: localStorage.clear() in beforeEach
  handleAuthEvent("INITIAL_SESSION", null);
  expect(useAuth.getState().user).toBeNull();
  expect(useAuth.getState().isLoaded).toBe(true);
});
```

**Step 4: Run**

```bash
npm test -- auth-state
npx tsc --noEmit
```

Expected: 2 tests pass, 0 tsc errors.

**Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/__tests__/auth-state.test.ts
git commit -m "fix(auth): §171 P1 — ignorer INITIAL_SESSION/null si token en storage (iOS PWA)"
```

---

## Task 8 — Auth : refresh sur `visibilitychange`

**Files:**
- Modify: `src/lib/auth.ts:397-444`

**Contexte:** Le timer 60 s de refresh proactif est suspendu par iOS quand l'app est en background. Au retour, on peut avoir un token expiré pendant 1-2 secondes avant que le timer reprenne.

**Step 1: Ajouter le listener**

À la fin de `auth.ts`, ajouter :

```ts
// §171 P1 — iOS suspend les timers en background. Au retour, forcer un refresh
// si elapsed > 50 min, AVANT que React Query ne déclenche des fetchs.
if (typeof window !== "undefined" && typeof document !== "undefined") {
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible") return;
    const { accessToken } = useAuth.getState();
    if (!accessToken) return;
    const elapsed = Date.now() - lastRefreshAt;
    const FORCE_THRESHOLD_MS = 50 * 60 * 1000;
    if (elapsed < FORCE_THRESHOLD_MS) return;
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) {
        console.warn("[auth] visibilitychange refresh failed", error);
      }
      // onAuthStateChange handles store sync on success
    } catch (err) {
      console.warn("[auth] visibilitychange refresh threw", err);
    }
  });
}
```

**Step 2: Test manuel**

Documenté dans Task 21 (scénario C). Pas de test unitaire (visibilitychange + setTimeout dans jsdom = friable).

**Step 3: Type check**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/lib/auth.ts
git commit -m "fix(auth): §171 P1 — refresh proactif sur visibilitychange (iOS background)"
```

---

## Task 9 — Offline queue : module-level mutex

**Files:**
- Modify: `src/components/shared/OfflineMutationSync.tsx:99-178`

**Contexte:** `isSyncingRef` est local au composant. En StrictMode dev (double mount) ou démontage rapide après `PWAInstallGate`, deux instances peuvent drainer en parallèle.

**Step 1: Écrire le test**

```ts
// src/components/shared/__tests__/OfflineMutationSync.test.tsx (nouveau)
import { describe, it, expect, vi, beforeEach } from "vitest";
// ⚠️ Test orienté unit — extraire la fonction `runSync` dans un module séparé
// `src/lib/offlineSync.ts` pour la tester isolément. Sinon faire un test e2e via Playwright.

// Pour une approche minimale : tester juste le mutex.
import { __runSyncOnce, __resetMutex } from "@/lib/offlineSync"; // créé en step 2

describe("offlineSync mutex", () => {
  beforeEach(() => { __resetMutex(); });

  it("two concurrent runSync calls execute drainTask only once", async () => {
    const drainTask = vi.fn().mockResolvedValue(undefined);
    await Promise.all([
      __runSyncOnce(drainTask),
      __runSyncOnce(drainTask),
    ]);
    expect(drainTask).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Extraire `runSync` dans `src/lib/offlineSync.ts`**

```ts
// src/lib/offlineSync.ts
let isDraining = false;

export async function __runSyncOnce(task: () => Promise<void>) {
  if (isDraining) return;
  isDraining = true;
  try {
    await task();
  } finally {
    isDraining = false;
  }
}

export function __resetMutex() {
  isDraining = false;
}
```

**Step 3: Refacto `OfflineMutationSync.tsx`**

Remplacer `useRef(false)` + le check `isSyncingRef.current` par un appel à `__runSyncOnce(async () => { /* corps du for-loop existant */ })`. Supprimer la déclaration `isSyncingRef`.

**Step 4: Run**

```bash
npm test -- offlineSync OfflineMutationSync
```

**Step 5: Commit**

```bash
git add src/lib/offlineSync.ts src/components/shared/OfflineMutationSync.tsx \
        src/components/shared/__tests__/OfflineMutationSync.test.tsx
git commit -m "fix(offline): §171 P1 — module-level mutex pour drainage queue"
```

---

## Task 10 — Offline queue : distinguer erreur réseau vs erreur métier

**Files:**
- Modify: `src/components/shared/OfflineMutationSync.tsx:118-145`
- Modify: `src/lib/offlineQueue.ts:89-106` (ajouter `markRetryNetworkOnly`)

**Contexte:** Une 5xx Supabase incrémente `retryCount` et tue l'item après 5 essais. Or une 5xx n'est pas une erreur "métier" (le payload est bon), juste une indispo. Distinguer : 5xx/`Failed to fetch` → ne PAS incrémenter retryCount (transient), 4xx/RLS → incrémenter (permanent).

**Step 1: Helper de classification**

Dans `offlineQueue.ts`, ajouter :

```ts
/** True if the error is recoverable on retry (network blip, server overload). */
export function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  if (msg.includes("failed to fetch")) return true;
  if (msg.includes("network")) return true;
  if (/\b5\d{2}\b/.test(msg)) return true; // any 5xx in message
  return false;
}
```

**Step 2: Modifier le catch dans `OfflineMutationSync.tsx`**

```ts
} catch (itemError) {
  lastError = itemError;
  console.error(...);
  if (isTransientError(itemError)) {
    // Don't penalize the item — Supabase blip, retry next online tick
    continue;
  }
  const dropped = markRetry(mutation.id);
  if (dropped) poisonedCount += 1;
}
```

**Step 3: Test**

Étendre `OfflineMutationSync.test.tsx` :

```ts
it("transient error (5xx) does not increment retryCount", async () => {
  enqueue("strength-set-log", { run_id: 1, exercise_id: 1 });
  vi.spyOn(api, "logStrengthSet").mockRejectedValue(new Error("503 Service Unavailable"));
  // ... trigger drain ...
  expect(getQueue()[0].retryCount).toBe(0);
});

it("permanent error (RLS 42501) increments retryCount", async () => {
  enqueue("strength-set-log", { run_id: 1, exercise_id: 1 });
  vi.spyOn(api, "logStrengthSet").mockRejectedValue(new Error("forbidden: 42501"));
  // ... trigger drain ...
  expect(getQueue()[0].retryCount).toBe(1);
});
```

**Step 4: Run + commit**

```bash
npm test -- offlineQueue OfflineMutationSync
git add src/lib/offlineQueue.ts src/components/shared/OfflineMutationSync.tsx \
        src/components/shared/__tests__/OfflineMutationSync.test.tsx
git commit -m "fix(offline): §171 P1 — épargner retryCount sur erreurs transitoires"
```

---

## Task 11 — RPC client : timeout 10 s + fallback queue

**Files:**
- Modify: `src/lib/api/strength.ts:486-501` (`logStrengthSet`)
- Modify: `src/lib/api/strength.ts:723-744` (`saveStrengthRun`)

**Contexte:** `await supabase.rpc(...)` peut hanger jusqu'à 5 min sur iOS. Race avec un timeout 10 s, sur expiration → enqueue offline.

**Step 1: Helper timeout**

Dans `src/lib/api/client.ts`, exporter :

```ts
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "rpc",
): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}: timeout after ${ms}ms`)), ms),
    ),
  ]);
}
```

**Step 2: Wrapper l'appel RPC critique**

`logStrengthSet:486` :

```ts
const rpcPromise = supabase.rpc("log_strength_set_atomic", { ... });
const { data, error } = await withTimeout(rpcPromise, 10_000, "log_strength_set_atomic");
```

`saveStrengthRun:723` : idem avec `withTimeout(... , 15_000, "save_strength_run_atomic")` (logs en bulk = plus long).

**Step 3: Caller — gérer le timeout côté `Strength.tsx`**

L'appel `logStrengthSet.mutate(payload, { onError: () => enqueue(...) })` (Strength.tsx:768) propagera l'erreur timeout au `onError`, donc enqueue automatique. Pour `saveStrengthRun` via `updateRun.mutateAsync` dans `onFinish` (Strength.tsx:824-833), le `try/catch` existant (ligne 835) capture déjà l'erreur et fait `enqueue("strength-run-completed", ...)`. **Aucun changement client requis** — vérifier juste que les chemins existants couvrent bien.

**Step 4: Test**

```ts
// src/lib/api/__tests__/strength-timeout.test.ts
import { describe, it, expect, vi } from "vitest";
import { withTimeout } from "@/lib/api/client";

describe("withTimeout", () => {
  it("resolves when promise wins", async () => {
    const r = await withTimeout(Promise.resolve(42), 100);
    expect(r).toBe(42);
  });
  it("rejects with timeout label when slow", async () => {
    const slow = new Promise((res) => setTimeout(() => res(1), 500));
    await expect(withTimeout(slow, 50, "test")).rejects.toThrow(/test: timeout/);
  });
});
```

**Step 5: Run + commit**

```bash
npm test -- strength-timeout
npx tsc --noEmit
git add src/lib/api/client.ts src/lib/api/strength.ts src/lib/api/__tests__/strength-timeout.test.ts
git commit -m "fix(rpc): §171 P1 — timeout 10/15 s sur RPCs strength + fallback queue"
```

---

## Task 12 — PWA : désactiver `skipWaiting`/`clientsClaim`, gating UpdateNotification

**Files:**
- Modify: `vite.config.ts:43-44`
- Modify: `src/main.tsx:14-33`
- Modify: `src/components/shared/UpdateNotification.tsx` (existant)

**Contexte:** Avec `skipWaiting+clientsClaim`, le nouveau SW prend le contrôle mid-session — risque de page blanche si un chunk lazy est résolu pendant la transition. Repasser sur le pattern « waiting » contrôlé par UpdateNotification.

**Step 1: Désactiver dans `vite.config.ts`**

```ts
workbox: {
  // ...
  cleanupOutdatedCaches: true,
  clientsClaim: false,
  skipWaiting: false,
  // ...
}
```

**Step 2: Adapter `main.tsx`**

`registerSW` doit appeler `r.update()` mais ne pas activer immédiatement. Le pattern :

```ts
const updateSW = registerSW({
  immediate: false,
  onNeedRefresh() {
    // Le nouveau SW est en attente — exposer un trigger UI
    window.dispatchEvent(new CustomEvent('pwa-update-available'));
  },
  onRegistered(r) {
    if (!r) return;
    (window as any).__pwaRegistration = r;
    setInterval(() => r.update().catch(() => {}), UPDATE_INTERVAL_MS);
  },
});

// Quand l'utilisateur clique « Mettre à jour », appeler updateSW(true) pour activer
async function applyUpdate() {
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  await updateSW(true); // skipWaiting + reload
}
```

**Step 3: Vérifier `UpdateNotification.tsx`**

Lire le composant existant : il doit déjà appeler `(window as any).__pwaApplyUpdate` ou similaire quand l'utilisateur valide. S'assurer que c'est connecté au nouveau `applyUpdate`.

**Step 4: Test manuel**

Lancer `npm run dev`. Builder avec `npm run build`, déployer (ou servir `dist/` localement avec `npx serve dist -l 8080`). Faire 2 builds successifs, vérifier que le 1er navigateur reçoit la notif `UpdateNotification` et que rien ne bouge tant qu'on ne clique pas.

**Step 5: Commit**

```bash
git add vite.config.ts src/main.tsx src/components/shared/UpdateNotification.tsx
git commit -m "fix(pwa): §171 P1 — gating UpdateNotification, retirer skipWaiting auto"
```

---

## Task 13 — PWA : push handler — skip notification si app focused

**Files:**
- Modify: `public/push-handler.js:5-36`

**Step 1: Refacto**

```js
self.addEventListener('push', function(event) {
  if (!event.data) return;
  var data;
  try { data = event.data.json(); } catch (e) { data = { title: 'EAC Natation', body: event.data.text() }; }

  event.waitUntil((async function() {
    try {
      // §171 P2 — if any window client is focused, skip OS notification (in-app toast handles it)
      var clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      var focused = clients.some(function(c) { return c.focused; });
      if (focused) {
        // Forward the payload to the focused client for in-app handling
        clients.forEach(function(c) {
          if (c.focused) c.postMessage({ type: 'eac-push', payload: data });
        });
        return;
      }

      var options = {
        body: data.body || '',
        icon: 'icon-192.png',
        badge: 'favicon.png',
        data: { url: data.url || '#/' },
        vibrate: [200, 100, 200],
        tag: data.tag || 'eac-notification',
        renotify: true,
      };
      await self.registration.showNotification(data.title || 'EAC Natation', options);
    } catch (err) {
      console.error('[push-handler] showNotification failed:', err);
    }
  })());
});
```

**Step 2: (Optionnel) handler côté React**

Dans `src/main.tsx` ou un nouveau hook `useInAppPushBridge`, écouter `navigator.serviceWorker.addEventListener('message', ...)` et router vers `useToast()` si `event.data.type === 'eac-push'`. Skip si `__eacInAppPushBridge` existe déjà (vérifier le code).

**Step 3: Test manuel**

Documenté dans Task 21 (scénario push foreground). Pas de test unitaire.

**Step 4: Commit**

```bash
git add public/push-handler.js
git commit -m "fix(pwa): §171 P2 — push handler skip OS notif si client focused"
```

---

# PHASE 3 — Couverture tests RLS prioritaires

Ces tests lockent le comportement actuel des policies critiques sans changement fonctionnel. Chaque task = 1 fichier de test, ~150 LOC.

## Task 14 — Test RLS `chrono_records`

**Files:**
- Modify: `supabase/tests/schema.sql` (refléter 00078 si absent)
- Modify: `supabase/tests/seed.sql` (ajouter 2 chrono_records)
- Create: `supabase/tests/rls/chrono_records.test.ts`

**Step 1: Vérifier que `chrono_records` est dans `schema.sql`**

```bash
grep -c "chrono_records" supabase/tests/schema.sql
```

Si 0 → ajouter le bloc CREATE TABLE + ENABLE RLS + CREATE POLICY de `00078_chrono_records.sql` à la fin.

**Step 2: Ajouter au seed**

```sql
-- chrono_records: Carol owns cr1, Eve owns cr2
INSERT INTO public.chrono_records (id, coach_id, status, label) VALUES
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'draft', 'Carol session'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005', 'sent',  'Eve session');
```

⚠️ La policy utilise `auth.uid()` (UUID auth) directement, donc le `authUid` doit matcher les UUIDs du seed (000...3 pour Carol, 000...5 pour Eve).

**Step 3: Test**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { asUser, resetDb } from "./_helpers";

const CAROL = { appUserId: 3, appUserRole: "coach" as const, authUid: "00000000-0000-0000-0000-000000000003" };
const EVE   = { appUserId: 5, appUserRole: "coach" as const, authUid: "00000000-0000-0000-0000-000000000005" };

beforeAll(async () => { await resetDb(); });

describe("chrono_records RLS (auth.uid() per coach)", () => {
  it("Carol sees only her own chrono_records", async () => {
    const rows = await asUser(CAROL, async (c) => {
      const r = await c.query<{ label: string }>(
        "SELECT label FROM chrono_records ORDER BY label",
      );
      return r.rows;
    });
    expect(rows.map((r) => r.label)).toEqual(["Carol session"]);
  });

  it("Eve cannot SELECT Carol's record", async () => {
    const rows = await asUser(EVE, async (c) => {
      const r = await c.query("SELECT id FROM chrono_records WHERE label = 'Carol session'");
      return r.rows;
    });
    expect(rows).toEqual([]);
  });

  it("Eve cannot DELETE Carol's record", async () => {
    const deleted = await asUser(EVE, async (c) => {
      const r = await c.query(
        "DELETE FROM chrono_records WHERE label = 'Carol session' RETURNING id",
      );
      return r.rows;
    });
    expect(deleted).toEqual([]);
  });
});
```

**Step 4: Run + commit**

```bash
npm run test:rls -- chrono_records
git add supabase/tests/schema.sql supabase/tests/seed.sql supabase/tests/rls/chrono_records.test.ts
git commit -m "test(rls): §171 — couverture chrono_records cross-coach"
```

---

## Task 15 — Tests RLS : `push_subscriptions`, `app_settings`, `one_rm_records`

**Files:**
- Create: `supabase/tests/rls/push_subscriptions.test.ts`
- Create: `supabase/tests/rls/app_settings.test.ts`
- Create: `supabase/tests/rls/one_rm_records.test.ts`

**Step 1: Vérifier le schema**

```bash
grep -c "push_subscriptions\|app_settings\|one_rm_records" supabase/tests/schema.sql
```

Si une table manque → l'ajouter depuis la migration source.

**Step 2: Pattern unique pour les 3 tables (template)**

Pour chaque table, écrire 4 tests minimum :
- own-row visible
- cross-user invisible
- cross-user mutation refused
- coach/admin bypass (si applicable)

Exemple `one_rm_records.test.ts` :

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { asUser, resetDb, asServiceRole } from "./_helpers";

const ALICE = { appUserId: 1, appUserRole: "athlete" as const };
const BOB   = { appUserId: 2, appUserRole: "athlete" as const };
const CAROL = { appUserId: 3, appUserRole: "coach" as const };

beforeAll(async () => {
  await resetDb();
  await asServiceRole(async (c) => {
    await c.query(
      `INSERT INTO one_rm_records (athlete_id, exercise_id, one_rm) VALUES (1, 1, 100), (2, 1, 90)`,
    );
  });
});

describe("one_rm_records RLS", () => {
  it("Alice sees only her own 1RM", async () => {
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query<{ athlete_id: number }>(
        "SELECT athlete_id FROM one_rm_records ORDER BY athlete_id",
      );
      return r.rows;
    });
    expect(rows.map((r) => r.athlete_id)).toEqual([1]);
  });

  it("Alice cannot INSERT a 1RM with athlete_id = Bob", async () => {
    await expect(
      asUser(ALICE, async (c) => {
        await c.query(
          `INSERT INTO one_rm_records (athlete_id, exercise_id, one_rm) VALUES (2, 1, 999)`,
        );
      }),
    ).rejects.toThrow(/row-level security|new row violates/);
  });

  it("Coach sees all 1RMs", async () => {
    const rows = await asUser(CAROL, async (c) => {
      const r = await c.query("SELECT athlete_id FROM one_rm_records");
      return r.rows;
    });
    expect(rows).toHaveLength(2);
  });
});
```

`app_settings.test.ts` : focus sur « coach (non-admin) cannot UPDATE ».
`push_subscriptions.test.ts` : focus sur « athlete cannot INSERT subscription with user_id=other ».

**Step 3: Run + commit**

```bash
npm run test:rls -- one_rm_records app_settings push_subscriptions
git add supabase/tests/schema.sql supabase/tests/rls/{one_rm_records,app_settings,push_subscriptions}.test.ts
git commit -m "test(rls): §171 — couverture one_rm_records, app_settings, push_subscriptions"
```

---

## Task 16 — Tests RLS : `pain_reports`, `wellness_checks`, `objectives`

**Files:**
- Create: `supabase/tests/rls/wellness_pain_objectives.test.ts` (3 sections dans 1 fichier — patterns identiques)

**Step 1: Vérifier schema** (idem Task 15).

**Step 2: Test (1 fichier consolidé)**

```ts
// own + coach-read pattern, applied to 3 tables.
// For each table: athlete sees own, athlete2 doesn't see athlete1's, coach sees all,
// athlete cannot mutate another's row.
```

Suivre le pattern de Task 15. ~120 LOC pour 3 sections × 4 tests chacune.

**Step 3: Run + commit**

```bash
npm run test:rls -- wellness_pain_objectives
git add supabase/tests/schema.sql supabase/tests/rls/wellness_pain_objectives.test.ts
git commit -m "test(rls): §171 — couverture pain_reports/wellness_checks/objectives"
```

---

# PHASE 4 — Documentation & post-fix

## Task 17 — Mise à jour des docs projet

**Files:**
- Modify: `docs/implementation-log.md` (ajouter §171 — gros bloc avec contexte/changements/fichiers/tests)
- Modify: `docs/ROADMAP.md` (`*Dernière mise à jour*` + entrée §171)
- Modify: `CLAUDE.md` (chantier §171, mise à jour `Dernière entrée en date`)
- Modify: `docs/FEATURES_STATUS.md` (mettre à jour les couches Auth, Offline, RLS, PWA si listées)

**Step 1: Suivre le workflow CLAUDE.md § « Workflow de documentation obligatoire »**

Ne rien inventer comme tailles de fichiers — mesurer via `wc -l` les fichiers modifiés au-delà de ±30%.

**Step 2: Commit**

```bash
git add docs/implementation-log.md docs/ROADMAP.md CLAUDE.md docs/FEATURES_STATUS.md
git commit -m "docs: §171 — log audit robustness fixes (P0/P1 + tests RLS)"
```

---

## Task 18 — Test manuel iOS PWA (scénarios A-F)

**Files:**
- Create: `docs/qa/2026-04-26-audit-robustness-manual-tests.md`

**Step 1: Documenter les 6 scénarios** issus du rapport d'audit (« Scénarios de test manuel infrastructure »).

Pour chacun :
- Préconditions
- Steps
- Critère de succès
- Statut (PASS/FAIL/NA)

**Step 2: Exécuter sur iPhone réel**

Au moins le scénario A (offline queue), C (iOS background return) et E (cross-coach hijack — exécuter via SQL Studio Supabase).

**Step 3: Commit**

```bash
git add docs/qa/2026-04-26-audit-robustness-manual-tests.md
git commit -m "docs(qa): §171 — protocole de test manuel post-fix"
```

---

## Task 19 — Final : vérification globale + merge

**Step 1: Run la suite complète**

```bash
npm test
npm run test:rls
npx tsc --noEmit
npm run build
```

Expected: **all green**. 0 erreurs tsc, build dist/ généré. Le total des tests Vitest doit avoir augmenté d'au moins :
- +5 tests offlineQueue
- +3 tests OfflineMutationSync
- +2 tests auth-state
- +2 tests withTimeout

Le total tests RLS doit avoir augmenté de :
- +6 cross-coach session_assignments
- +3 save_strength_run_atomic authz
- +3 chrono_records
- +9 (3×3) one_rm_records / app_settings / push_subscriptions
- +12 (3×4) wellness/pain/objectives

Soit **~33 tests RLS** + **~12 tests Vitest** ajoutés. Mettre à jour `CLAUDE.md` avec le nouveau total `333 + 12 = 345 tests`.

**Step 2: Merge dans `main`**

```bash
git checkout main
git merge audit-robustness-§171 --no-ff -m "merge: §171 — audit robustness fixes (P0/P1 + tests)"
git push origin main
```

**Step 3: Surveiller le déploiement**

GitHub Actions va builder + déployer. Vérifier que `version.json` contient le nouveau timestamp et que la console PWA affiche bien `[EAC] Build:` avec la nouvelle date.

**Step 4: Sentinelle — monitoring 48 h**

Surveiller :
- Aucun rapport utilisateur de page blanche iOS au retour BG
- Aucun rapport « ma séance n'a pas été enregistrée »
- Logs console côté Sentry ou similaire si en place

---

## Récapitulatif des tasks

| # | Task | Phase | Effort | P0/P1 |
|---|---|---|---|---|
| 1 | Migration RLS assignments_write | 1 | 30 min | P0 #1 |
| 2 | Test RLS cross-coach assignments | 1 | 1 h | P0 #1 |
| 3 | Migration RPC save_strength_run authz | 1 | 30 min | P0/P1 #5 |
| 4 | Test RPC save_strength_run authz | 1 | 30 min | P0/P1 #5 |
| 5 | Offline queue quota handling | 1 | 1 h | P0 #2 |
| 6 | NetworkOnly /auth/* | 1 | 15 min | P0 #4 |
| 7 | Auth INITIAL_SESSION/null fix | 2 | 1 h | P1 |
| 8 | Auth visibilitychange refresh | 2 | 30 min | P1 |
| 9 | Offline queue mutex | 2 | 1 h | P1 |
| 10 | Offline queue transient errors | 2 | 1 h | P1 |
| 11 | RPC client timeout | 2 | 1 h | P1 |
| 12 | PWA skipWaiting + UpdateNotification | 2 | 1 h | P1 |
| 13 | Push handler foreground gating | 2 | 30 min | P2 |
| 14 | Test RLS chrono_records | 3 | 30 min | P0 #3 |
| 15 | Test RLS one_rm/app_settings/push_sub | 3 | 1 h | tests |
| 16 | Test RLS wellness/pain/objectives | 3 | 1 h | tests |
| 17 | Update docs | 4 | 30 min | docs |
| 18 | Manual QA iOS | 4 | 1 h | QA |
| 19 | Final verification + merge | 4 | 30 min | merge |

**Total estimé : ~12 h dev + 1 h QA = ~1.5 j ≈ 1 sprint solo dense**.

L'audit annonçait 8.5 j en effort large (avec rampe-up RLS pour 10 tables). Ce plan livre les 4 P0 + 6 P1 + 4 lots de tests RLS prioritaires en 1.5 j en restant strict sur le scope.

---

## Notes importantes

- **Ne pas court-circuiter les tests RLS** : les bugs §113 (DELETE no-op) et l'audit actuel viennent d'absences de tests.
- **Migrations 00145 + 00146 sont indépendantes** : si l'une casse en MCP, l'autre peut être appliquée seule.
- **Task 5 (quota) doit être merge avant le déploiement** : c'est un fix « invisible » côté UI mais critique côté pertes de données.
- **Pas de feature flag** : ces fixes sont tous backwards-compatible (durcissement ou meilleure UX d'erreur), pas besoin de gate.
- **Pas d'amend** : si un commit échoue à cause d'un hook, créer un nouveau commit fixant l'erreur.
- **Convention de commit** : préfixe `fix/test/docs(scope): §171 — message` (cf. derniers commits du projet).
