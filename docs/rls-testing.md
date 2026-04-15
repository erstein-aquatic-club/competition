# RLS Integration Testing

Tests d'intégration Row-Level Security contre un Postgres local (Docker via Supabase CLI). Objectif : attraper les régressions type §113 — policies RLS qui filtrent silencieusement et font passer des DELETE/UPDATE no-op pour des succès.

## Pourquoi ces tests existent

### Le bug qu'on cherche à prévenir

En §113, une policy `dim_sessions_delete` ne contenait pas la branche athlète, donc quand un nageur essayait de supprimer son propre ressenti via l'UI :

1. Le client JS appelait `supabase.from('dim_sessions').delete().eq('id', N)`
2. La RLS filtrait la row (athlète non admin/coach) → 0 rows match
3. PostgREST renvoyait `{data: null, error: null}` (succès avec 0 rows affected)
4. `useMutation.onSuccess` déclenchait `toast({title: "Supprimé"})`
5. En réalité la row était toujours là → bug silencieux, UX cassée, pas d'alerte

Le problème : **un test unitaire avec un mock Supabase ne l'aurait pas attrapé**, car le mock reproduit l'API JS, pas la sémantique des policies Postgres. Seul un test contre un vrai Postgres avec les vraies policies peut le révéler.

### Ce que ces tests vérifient

Pour chaque policy critique, on assert :

- **Affirmatif** : le rôle autorisé peut faire l'opération (`RETURNING` renvoie la row)
- **Négatif explicite** : le rôle non autorisé se voit filtrer (`RETURNING []` = 0 rows, ou exception `new row violates row-level security`)

Les tests tournent dans une transaction qui est **toujours rollback** — le seed reste stable entre tests.

## Architecture

```
supabase/
├── config.toml                    ← [db.migrations] enabled = false
├── migrations/                    ← canonical, managed via MCP (prod)
└── tests/
    ├── schema.sql                 ← hand-crafted minimal schema + helpers + policies
    ├── seed.sql                   ← fixtures déterministes
    └── rls/
        ├── _helpers.ts            ← pg.Pool, resetDb(), asUser(), asServiceRole()
        └── dim_sessions.test.ts   ← premier test suite (§113 regression)
scripts/
└── test-db-bootstrap.sh           ← apply schema+seed via psql (debug manuel)
vitest.config.rls.ts               ← config Vitest isolée
```

### Pourquoi un schéma hand-crafted vs. dump prod ?

Les migrations du repo **dérivent de prod** — certaines colonnes ont été ajoutées via MCP sans être backfillées en migration. Replay local des 108 migrations bute sur :

- 6 paires de versions dupliquées (`00007`, `00021`, `00025`, `00045`, `00059`, `00086`)
- Dépendances croisées (00034 référence `competitions` qui est créé en 00050)
- Bugs du parseur CLI sur `$$`-quoted function bodies multi-statements
- Schema drift (colonnes ajoutées hors migrations)

Solution pragmatique : **hand-crafter un schéma minimal** qui copie uniquement les tables/policies dont on a besoin pour les tests, et le maintenir en sync manuellement quand les policies prod changent. Trade-off accepté : plus simple, plus rapide, plus maintenable qu'un replay fragile.

**Règle d'or** : si tu modifies une policy en prod (via `apply_migration` MCP), mets à jour `supabase/tests/schema.sql` dans le même commit. Sinon le test continuera à valider l'ancienne version.

## Setup initial (une fois par dev machine)

### Prérequis

```bash
# 1. Docker Desktop (Mac) — https://docker.com/products/docker-desktop
# 2. Supabase CLI
brew install supabase/tap/supabase

# 3. Postgres client (psql)
brew install libpq
# Ajouter au PATH shell :
echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Démarrer l'environnement

```bash
# 1. Lance Docker Desktop (GUI) — il doit tourner en background
# 2. Depuis la racine du repo :
supabase start
# Premier run : ~2 min (pull des images). Runs suivants : ~5s.
```

Sortie attendue : `supabase status` montre API URL (:54321), DB URL (:54322), etc.

**IMPORTANT** : `supabase start` **n'applique PAS** les 108 migrations (désactivé dans `supabase/config.toml`). Tu obtiens un Postgres vide. C'est normal — les tests bootstrapent leur propre schéma.

### Lancer les tests

```bash
npm run test:rls
```

Tu devrais voir :

```
 ✓ supabase/tests/rls/dim_sessions.test.ts (13 tests) 152ms
 Test Files  1 passed (1)
      Tests  13 passed (13)
```

## Écrire un nouveau test RLS

### Étape 1 — Ajouter la table/policy à `schema.sql`

Dump la définition réelle depuis prod via MCP :

```sql
-- Via le MCP Supabase (mcp__plugin_supabase_supabase__execute_sql) :

-- Policies d'une table :
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS check_expr
FROM pg_policy WHERE polrelid = 'public.NOM_TABLE'::regclass;

-- Colonnes d'une table :
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'NOM_TABLE'
ORDER BY ordinal_position;
```

Copie les résultats dans `supabase/tests/schema.sql` en suivant le format existant (bloc commenté, CREATE TABLE, ALTER...ENABLE ROW LEVEL SECURITY, CREATE POLICY).

### Étape 2 — Ajouter des fixtures à `seed.sql`

Garde les IDs déterministes (1, 2, 3...) pour des assertions stables. `SELECT setval(..., 100, false)` pour que les INSERT suivants dans les tests commencent à 100.

### Étape 3 — Écrire le test

Copie `dim_sessions.test.ts` comme template :

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asUser, asServiceRole, resetDb, pool } from "./_helpers";

const ALICE = { appUserId: 1, appUserRole: "athlete" } as const;
const COACH = { appUserId: 3, appUserRole: "coach" } as const;

beforeAll(async () => { await resetDb(); });
afterAll(async () => { await pool.end(); });

describe("NOM_TABLE RLS", () => {
  it("athlete voit seulement X", async () => {
    const rows = await asUser(ALICE, async (c) => {
      const r = await c.query("SELECT id FROM NOM_TABLE ORDER BY id");
      return r.rows;
    });
    expect(rows).toEqual([...]);
  });
});
```

### Étape 4 — Runner

```bash
npm run test:rls
```

## API du harness

### `resetDb(): Promise<void>`

Re-applique `schema.sql` (qui fait `DROP SCHEMA public CASCADE` d'abord) puis `seed.sql`. Idempotent. Appelle dans `beforeAll` une fois par suite.

### `asUser(claims, fn)`

Lance `fn(client)` dans une transaction avec :

```sql
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"app_metadata":{"app_user_id":N,"app_user_role":"..."}}';
```

La transaction est **toujours ROLLBACK** à la fin, même en cas de succès. Les tests assertent sur ce que RLS a autorisé/bloqué, pas sur le state persisté.

Types :

```typescript
interface AuthClaims {
  appUserId: number;
  appUserRole: "athlete" | "coach" | "admin";
}
```

### `asServiceRole(fn)`

Lance `fn(client)` en superuser `postgres`, **bypass RLS**. Usage rare : vérifier le state persisté après un test `asUser`, ou setup/teardown manuel hors de la transaction rollback.

### `pool: pg.Pool`

Le pool partagé (max 4 connexions). `afterAll` doit faire `await pool.end()` pour fermer proprement.

## Débugger un test qui échoue

### Voir ce que voit l'utilisateur simulé

Ajoute temporairement dans ton test :

```typescript
await asUser(ALICE, async (c) => {
  const all = await c.query("SELECT * FROM dim_sessions");
  console.log("Alice sees:", all.rows);
  const me = await c.query("SELECT app_user_id() AS id, app_user_role() AS role");
  console.log("app_user_* =", me.rows);
});
```

### Inspecter la DB directement

```bash
# Reset + bootstrap manuel du schéma de test :
./scripts/test-db-bootstrap.sh

# Se connecter et explorer :
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres

postgres=# \dt
postgres=# SELECT polname, pg_get_expr(polqual, polrelid) FROM pg_policy WHERE polrelid = 'public.dim_sessions'::regclass;
postgres=# BEGIN;
postgres=# SET LOCAL ROLE authenticated;
postgres=# SET LOCAL "request.jwt.claims" TO '{"app_metadata":{"app_user_id":1,"app_user_role":"athlete"}}';
postgres=# DELETE FROM dim_sessions WHERE id = 3 RETURNING id;  -- simule le §113 bug
postgres=# ROLLBACK;
```

### Vérifier qu'une policy correspond à prod

```bash
# Via MCP (prod, read-only) :
# mcp__plugin_supabase_supabase__execute_sql
# Query : SELECT pg_get_expr(polqual, polrelid) FROM pg_policy WHERE polname = 'X';

# Comparer avec supabase/tests/schema.sql ligne N
```

Si divergence → mets à jour `schema.sql` dans le commit qui modifie la policy en prod.

## Pièges fréquents

1. **Oublier `BEGIN` avant `SET LOCAL`** — `SET LOCAL` ne fonctionne qu'en transaction. `asUser()` gère ça automatiquement ; ne contourne pas.
2. **Committer dans un test** — cassé par design : les tests sont isolés par rollback. Si tu veux vérifier du state persisté, utilise `asServiceRole` séparément.
3. **Pool non fermé** — si tu oublies `afterAll(() => pool.end())`, Vitest hang 10s avant de sortir.
4. **Modifier `schema.sql` sans re-run** — Vitest ne reload pas le fichier entre tests d'une même session `resetDb()`. Re-run complet via `npm run test:rls`.
5. **Ports occupés** — si `supabase start` se plaint du port 54321/54322, un autre projet Supabase tourne. `supabase stop` dans le projet concurrent.
6. **Docker Desktop suspendu** — si les tests échouent avec `ECONNREFUSED 127.0.0.1:54322`, ouvre Docker Desktop et vérifie que le container `supabase_db_competition` tourne.

## Relation avec les migrations prod

| Action en prod | Action ici |
|---|---|
| Ajout d'une policy via MCP `apply_migration` | Copier la policy dans `supabase/tests/schema.sql` + ajouter un test |
| Modification d'une policy existante | Mettre à jour `schema.sql` **dans le même commit** que la migration prod |
| Suppression d'une policy | Retirer de `schema.sql` + retirer les tests correspondants |
| Ajout d'une colonne (sans changement RLS) | Rien à faire ici, sauf si un test l'utilise |

**Le test doit toujours refléter l'état réel de prod.** Sinon il donne une fausse sécurité.

## Évolutions futures

- **CI GitHub Actions** : workflow `.github/workflows/rls-tests.yml` avec `supabase/setup-cli@v1` + `docker compose` pour faire tourner ces tests à chaque PR. À ajouter quand le nombre de tests justifie le coût (3-5 min par PR).
- **Couverture élargie** : `slot_assignments`, `training_slots`, `competitions`, `coach_assignments` — chaque nouvelle table/policy critique ajoute un fichier `.test.ts` dédié sans toucher au harness.
- **Test des Edge Functions** : scope différent (Deno runtime, JWT vérif), pas dans ce harness.
- **Dump automatisé depuis prod** : script qui régénère `schema.sql` depuis prod via MCP en cas de drift suspecté. Pas prioritaire tant que les policies changent rarement.
