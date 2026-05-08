# §223 RPC `get_coach_kpis` Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remplacer les 2N requêtes Supabase REST de `coachKpisQuery` (`Coach.tsx:1034-1141`) par 1 appel RPC `get_coach_kpis(athlete_ids, from_date, to_date)`. Gain : **2-10 round-trips → 1**, ~600-700 ms gagnés en 4G coach mobile (max 5 athlètes vu `topAthletes.slice(0,5)`).

**Architecture:** Migration SQL crée la fonction Postgres (security invoker, RLS héritée). Wrapper TS dans `api/coach-kpis.ts` exporté via `@/lib/api`. `Coach.tsx` simplifié : queryFn passe de ~110 LOC à ~30 LOC, dead code (`mostLoadedAthlete`, `formeScores`, `loadScore`, `formeScore`) supprimé en bonus YAGNI.

**Tech Stack:** Supabase (Postgres 15 + RLS), TypeScript 5, React 19 + React Query 5, Vite 7. Migrations via MCP `mcp__plugin_supabase_supabase__apply_migration` (project ID `fscnobivsgornxdwqwlk`).

---

## Pré-requis

- Working tree status au démarrage : `M docs/implementation-log.md` + `?? docs/audits/...` (user §215 audit, **NE PAS toucher**).
- Les commits §214/§216/§217/§218/§219 sont sur main et déployés.
- Lire avant de coder : `docs/plans/2026-05-08-coach-kpis-rpc-design.md` (design validé).

## Inventaire pré-existant

- **`Coach.tsx:1034-1141`** : `coachKpisQuery` actuel. 2N requêtes via `Promise.all(topAthletes.map(...))`. Calcule `fatigueAlerts` (consommé l. 1194) + `mostLoadedAthlete` + `formeScores` (**0 consumer** vérifié par grep).
- **`Coach.tsx:875-905`** : helpers `getRunTimestamp`, `normalizeFatigueValue`, `getRunFatigueValue`, `buildFatigueRating`. **Conservés intacts** — le client garde la logique de normalisation.
- **`Coach.tsx:198-200`** : constantes seuils `FATIGUE_ALERT_MIN_SAMPLES = 2`, `FATIGUE_ALERT_HIGH_THRESHOLD = 4.2`, `FATIGUE_ALERT_MAX_THRESHOLD = 4.7`. **Restent côté TS**.
- **`topAthletes = myAthletes.slice(0, 5)`** ligne 1024 : maximum 5 athlètes. Donc 2 à 10 round-trips actuels (pas 40 comme initialement estimé).
- **RLS harness** : `supabase/tests/rls/dim_sessions.test.ts` et `save_strength_run_authz.test.ts` couvrent les 2 tables. On peut ajouter un test dédié au RPC.

## Méthodologie d'exécution

Subagent-driven, 1 implementer batché pour Tasks 1-7 (schéma → migration → apply → types → wrapper → RLS test → Coach.tsx). Tasks 8-9 (validation + docs) gérées en main par le contrôleur après spec/code-quality reviews.

---

## Task 1 — Vérifier le schéma `dim_sessions` + `strength_session_runs`

**Files:** aucune modification — read-only via MCP.

**Pourquoi:** la migration doit utiliser les noms de colonnes exacts. La JS code utilise `session.fatigue ?? session.feeling` mais la DB n'a peut-être que `fatigue` (post-mapping). Pour `strength_session_runs`, vérifier si `fatigue` est colonne directe ou JSONB `raw_payload->>'fatigue'`.

**Step 1: Lister les colonnes des 2 tables**

Run via MCP :
```
mcp__plugin_supabase_supabase__list_tables({
  project_id: "fscnobivsgornxdwqwlk",
  schemas: ["public"]
})
```

Capture pour `dim_sessions` les colonnes : `athlete_id`, `session_date`, `fatigue`, `rpe`, `performance`, `engagement`, `duration`, plus toute autre colonne pertinente.

Pour `strength_session_runs` : `athlete_id`, `fatigue` (existe ou pas ?), `feeling`, `rpe`, `duration`, `started_at`, `completed_at`, `date`, `created_at`, `raw_payload`.

**Step 2: Notes pour la migration**

Si `dim_sessions.fatigue` n'existe pas (uniquement `feeling`/`rpe`), ajuster le `coalesce()` dans la migration. Si `strength_session_runs.fatigue` n'existe pas, utiliser `nullif(raw_payload->>'fatigue', '')::numeric`.

**Critère de réussite Task 1:** notes claires sur les noms de colonnes à utiliser dans la migration.

---

## Task 2 — Écrire la migration `00157_get_coach_kpis_rpc.sql`

**Files:**
- Create: `supabase/migrations/00157_get_coach_kpis_rpc.sql`

**Step 1: Créer le fichier**

Squelette (à ajuster selon Task 1) :

```sql
-- §223 — RPC get_coach_kpis : agrège les valeurs de fatigue (sessions + runs)
-- pour une liste d'athlètes sur une fenêtre [from_date, to_date].
-- Remplace 2N requêtes REST (Coach.tsx coachKpisQuery) par 1 round-trip.
-- security invoker : RLS héritée des policies existantes sur dim_sessions
-- et strength_session_runs. Pas de bypass — un coach ne voit que les
-- athlètes qu'il peut déjà lire individuellement.

create or replace function public.get_coach_kpis(
  athlete_ids int[],
  from_date date,
  to_date date
)
returns table (
  athlete_id int,
  fatigue_values numeric[]
)
language sql
stable
security invoker
set search_path = public
as $$
  with swim_fatigue as (
    select s.athlete_id, coalesce(s.fatigue, s.rpe)::numeric as v
    from public.dim_sessions s
    where s.athlete_id = any(athlete_ids)
      and s.session_date between from_date and to_date
      and coalesce(s.fatigue, s.rpe) is not null
  ),
  strength_fatigue as (
    select r.athlete_id,
      coalesce(
        r.fatigue,
        nullif(r.raw_payload->>'fatigue', '')::numeric
      )::numeric as v
    from public.strength_session_runs r
    where r.athlete_id = any(athlete_ids)
      and coalesce(
        r.completed_at,
        r.started_at,
        r.date::timestamptz,
        r.created_at
      ) between from_date::timestamptz
              and (to_date + interval '1 day')::timestamptz
      and (r.fatigue is not null or r.raw_payload->>'fatigue' is not null)
  ),
  combined as (
    select athlete_id, v from swim_fatigue
    union all
    select athlete_id, v from strength_fatigue
  )
  select
    a.id as athlete_id,
    coalesce(
      array_agg(c.v) filter (where c.v is not null),
      '{}'::numeric[]
    ) as fatigue_values
  from unnest(athlete_ids) as a(id)
  left join combined c on c.athlete_id = a.id
  group by a.id;
$$;

-- Grant execute to authenticated role (Supabase default for client-side calls).
grant execute on function public.get_coach_kpis(int[], date, date)
  to authenticated;
```

**IMPORTANT** :
- Si Task 1 révèle que `dim_sessions.fatigue` n'existe pas → utiliser uniquement `s.rpe` (ou la colonne effective).
- Si `strength_session_runs.fatigue` n'existe pas → utiliser uniquement `nullif(r.raw_payload->>'fatigue', '')::numeric`.
- Vérifier le type de `r.date` (date vs timestamptz) — adapter le cast si besoin.
- `unnest(athlete_ids) as a(id)` garantit qu'un athlète sans sessions/runs retourne quand même une row avec `fatigue_values = '{}'` (parité avec le JS qui retourne `null` rating dans ce cas).

**Critère de réussite Task 2:** le fichier SQL existe, syntax verifiée localement.

---

## Task 3 — Appliquer la migration via MCP

**Files:** aucun changement local (la migration est appliquée côté Supabase).

**Step 1: apply_migration via MCP**

Run :
```
mcp__plugin_supabase_supabase__apply_migration({
  project_id: "fscnobivsgornxdwqwlk",
  name: "00157_get_coach_kpis_rpc",
  query: "[contenu du fichier 00157_get_coach_kpis_rpc.sql]"
})
```

**Step 2: Vérifier que la fonction existe**

Run :
```
mcp__plugin_supabase_supabase__execute_sql({
  project_id: "fscnobivsgornxdwqwlk",
  query: "select proname, proargnames, pg_get_function_result(oid) from pg_proc where proname = 'get_coach_kpis';"
})
```
Expected: 1 row, `proname = get_coach_kpis`, args `{athlete_ids,from_date,to_date}`.

**Step 3: Smoke test SQL**

Tester avec les athletes IDs du coach connecté (à demander au user si besoin, ou utiliser un coach test de la DB) :
```
mcp__plugin_supabase_supabase__execute_sql({
  project_id: "fscnobivsgornxdwqwlk",
  query: "select * from public.get_coach_kpis(array[1,2,3]::int[], '2026-04-22', '2026-05-08');"
})
```

Si erreur 42703 (column does not exist) → revenir Task 2, ajuster le SQL.

**Critère de réussite Task 3:** la fonction est invocable, retourne des rows attendues.

---

## Task 4 — Regénérer les types TypeScript

**Files:** aucun fichier source modifié (les types Supabase sont auto-générés et stockés dans `src/lib/database.types.ts` ou similaire — vérifier le chemin via `grep -rln "Database.*PublicSchema" src/`).

**Step 1: Generate types via MCP**

Run :
```
mcp__plugin_supabase_supabase__generate_typescript_types({
  project_id: "fscnobivsgornxdwqwlk"
})
```

Le résultat est un blob TypeScript qu'il faut écrire dans le fichier de types existant (ou nouveau).

**Step 2: Vérifier que `Database['public']['Functions']['get_coach_kpis']` est typé correctement**

Le type généré doit contenir une entrée :
```ts
get_coach_kpis: {
  Args: {
    athlete_ids: number[];
    from_date: string;
    to_date: string;
  };
  Returns: {
    athlete_id: number;
    fatigue_values: number[];
  }[];
};
```

**Step 3: Si le projet n'a pas de fichier de types généré**, signaler — l'API wrapper utilisera des types manuels en fallback.

**Critère de réussite Task 4:** la fonction est typée OU types manuels prêts à être ajoutés au wrapper Task 5.

---

## Task 5 — Créer `src/lib/api/coach-kpis.ts` + re-export

**Files:**
- Create: `src/lib/api/coach-kpis.ts`
- Modify: `src/lib/api/index.ts`

**Step 1: Écrire le wrapper**

```ts
/**
 * Coach KPI aggregation API.
 * §223 — RPC get_coach_kpis : 1 round-trip pour récupérer les valeurs de
 * fatigue (sessions + strength runs) de plusieurs athlètes sur une fenêtre.
 * Remplace les 2N requêtes REST de Coach.tsx coachKpisQuery.
 *
 * Le client agrège ensuite via buildFatigueRating/normalizeFatigueValue
 * (Coach.tsx) — la logique seuils + sort + filter reste TS-side.
 */

import { supabase } from "./client";

export interface CoachKpiRow {
  athlete_id: number;
  /** Valeurs brutes (DB scale 1-10). Le client normalise via normalizeFatigueValue. */
  fatigue_values: number[];
}

/**
 * Retourne une Map athleteId → fatigue values pour la fenêtre [fromDate, toDate].
 * Un athlète sans sessions/runs apparaît avec un array vide.
 *
 * @param athleteIds  Liste d'IDs d'athlètes (typiquement 1-5 = topAthletes coach home).
 * @param fromDate    Date ISO YYYY-MM-DD inclusive.
 * @param toDate      Date ISO YYYY-MM-DD inclusive.
 */
export async function getCoachKpis(
  athleteIds: number[],
  fromDate: string,
  toDate: string,
): Promise<Map<number, number[]>> {
  if (athleteIds.length === 0) return new Map();

  const { data, error } = await supabase.rpc("get_coach_kpis", {
    athlete_ids: athleteIds,
    from_date: fromDate,
    to_date: toDate,
  });

  if (error) {
    throw new Error(`getCoachKpis failed: ${error.message}`);
  }

  const map = new Map<number, number[]>();
  for (const row of (data ?? []) as CoachKpiRow[]) {
    map.set(row.athlete_id, row.fatigue_values ?? []);
  }
  return map;
}
```

**Step 2: Ajouter le re-export à `api/index.ts`**

```ts
// Coach KPIs (§223)
export { getCoachKpis, type CoachKpiRow } from "./coach-kpis";
```

À placer dans la section appropriée (groupe coach ou nouveau bloc dédié).

**Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: pas d'erreur.

**Critère de réussite Task 5:** wrapper exporté depuis `@/lib/api`, types corrects.

---

## Task 6 — Ajouter un test RLS pour `get_coach_kpis`

**Files:**
- Create: `supabase/tests/rls/get_coach_kpis.test.ts`

**Pourquoi:** règle CLAUDE.md "Quand lancer test:rls" — modifier une migration RLS ou ajouter une fonction qui dépend des policies → ajouter un test pour attraper les régressions silencieuses.

**Step 1: Créer le fichier de test**

Squelette à adapter au harness existant (lire `supabase/tests/rls/dim_sessions.test.ts` pour les conventions) :

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupRlsTest, type RlsContext } from "./_helpers";

describe("get_coach_kpis RPC — RLS coverage", () => {
  let ctx: RlsContext;

  beforeAll(async () => {
    ctx = await setupRlsTest();
  });

  afterAll(async () => {
    await ctx.teardown();
  });

  it("a coach can call the RPC for athletes they have visibility on", async () => {
    const { coachClient, coachAthleteIds } = ctx;
    const { data, error } = await coachClient.rpc("get_coach_kpis", {
      athlete_ids: coachAthleteIds,
      from_date: "2026-01-01",
      to_date: "2026-12-31",
    });
    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.length).toBe(coachAthleteIds.length);
  });

  it("a coach gets empty fatigue_values for athletes outside their team", async () => {
    const { coachClient, otherCoachAthleteIds } = ctx;
    // RLS doit filtrer les rows que le coach ne peut pas voir.
    // L'array_agg() filter retourne {} si aucune row matche.
    const { data, error } = await coachClient.rpc("get_coach_kpis", {
      athlete_ids: otherCoachAthleteIds,
      from_date: "2026-01-01",
      to_date: "2026-12-31",
    });
    expect(error).toBeNull();
    // Le RPC retourne 1 row par athlete_id input avec fatigue_values = []
    expect(data!.every((r: any) => r.fatigue_values.length === 0)).toBe(true);
  });

  it("an athlete cannot call this RPC (or sees only their own data)", async () => {
    const { athleteClient, otherAthleteIds } = ctx;
    const { data, error } = await athleteClient.rpc("get_coach_kpis", {
      athlete_ids: otherAthleteIds,
      from_date: "2026-01-01",
      to_date: "2026-12-31",
    });
    // security invoker : l'athlète ne voit pas les sessions des autres → fatigue_values = []
    if (!error) {
      expect(data!.every((r: any) => r.fatigue_values.length === 0)).toBe(true);
    }
  });
});
```

**IMPORTANT** : adapter aux conventions exactes du harness (`_helpers.ts`). Si le harness n'expose pas `coachAthleteIds`/`otherCoachAthleteIds`, soit étendre `_helpers.ts`, soit utiliser des IDs fixés depuis `seed.sql`. Vérifier d'abord la structure du harness.

**Step 2: Vérifier la structure du test (sans Docker pour l'instant)**

Run: `npx tsc --noEmit 2>&1 | grep get_coach_kpis`
Expected: pas d'erreur de compilation.

**Critère de réussite Task 6:** fichier de test compile, conventions respectées (la suite RLS sera lancée par l'utilisateur).

---

## Task 7 — Refactor `Coach.tsx:1034-1141` + cleanup dead code

**Files:**
- Modify: `src/pages/Coach.tsx`

**Step 1: Ajouter l'import**

Top du fichier, dans le bloc `from "@/lib/api"` :
```tsx
getCoachKpis,
```

(ajouter à la liste des named imports existants)

**Step 2: Réécrire `coachKpisQuery`**

Remplacer le bloc `Coach.tsx:1034-1141` (~110 LOC) par :

```tsx
const coachKpisQuery = useQuery({
  queryKey: ["coach-kpis", kpiPeriod, topAthleteKey],
  enabled: coachAccess && activeSection === "home" && topAthletes.length > 0,
  queryFn: async () => {
    const lookbackDays = kpiPeriod;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);
    const fromDate = getDateOnly(startDate);
    const toDate = getDateOnly(new Date());

    const athleteIds = topAthletes
      .map((a) => a.id)
      .filter((id): id is number => typeof id === "number");

    const fatigueByAthlete = await getCoachKpis(athleteIds, fromDate, toDate);

    const fatigueAlerts = topAthletes
      .map((athlete) => {
        if (athlete.id == null) return null;
        const values = fatigueByAthlete.get(athlete.id) ?? [];
        const rating = buildFatigueRating(values);
        if (!rating) return null;
        if (rating.sampleCount < FATIGUE_ALERT_MIN_SAMPLES) return null;
        if (rating.average < FATIGUE_ALERT_HIGH_THRESHOLD) return null;
        return {
          athleteName: athlete.display_name,
          rating: rating.rating,
          average: rating.average,
          sampleCount: rating.sampleCount,
          level:
            rating.average >= FATIGUE_ALERT_MAX_THRESHOLD
              ? ("max" as const)
              : ("high" as const),
        };
      })
      .filter((alert): alert is NonNullable<typeof alert> => alert !== null)
      .sort((a, b) => {
        if (b.average !== a.average) return b.average - a.average;
        return b.sampleCount - a.sampleCount;
      });

    return { fatigueAlerts };
  },
});
```

**Step 3: Cleanup dead code**

Vérifier post-edit qu'il n'y a plus de références à :
- `mostLoadedAthlete`
- `formeScores`
- `loadScore`
- `formeScore`

```bash
grep -n "mostLoadedAthlete\|formeScores\|loadScore\|formeScore" /Users/francoiswagner/Antigravity/Project-EAC/competition/src/pages/Coach.tsx
```
Expected: 0 résultats.

**Step 4: Vérifier le rendu**

`Coach.tsx:1194` lit `coachKpisQuery.data?.fatigueAlerts ?? []`. Vérifier que la nouvelle queryFn retourne bien `{ fatigueAlerts: [...] }`. Pas d'autre changement requis.

**Step 5: Vérifier les helpers conservés**

Les helpers suivants restent intacts (utilisés par `buildFatigueRating`) :
- `getRunTimestamp` (l. 877-878) — devient inutilisé. **Supprimer si grep confirme 0 caller.**
- `getRunFatigueValue` (l. 890-895) — devient inutilisé (la logique est en SQL maintenant). **Supprimer si grep confirme 0 caller.**
- `normalizeFatigueValue` (l. 879-889) — utilisé par `buildFatigueRating`. **Conserver.**
- `buildFatigueRating` (l. 897-905) — utilisé par la nouvelle queryFn. **Conserver.**

```bash
grep -n "getRunTimestamp\|getRunFatigueValue" /Users/francoiswagner/Antigravity/Project-EAC/competition/src/pages/Coach.tsx
# Si seules les déclarations restent → supprimer les déclarations.
```

**Step 6: Vérifier la compilation**

Run: `npx tsc --noEmit 2>&1 | tail -10; echo EXITCODE=$?`
Expected: `EXITCODE=0`.

Run: `npm test 2>&1 | grep "ℹ pass\|ℹ fail" | tail -2`
Expected: `pass 684`, `fail 1` (transformers.test.ts:18 pré-existant).

**Critère de réussite Task 7:** `tsc` clean, tests pass, dead code retiré, queryFn utilisée par CoachHome.

---

## Task 8 — Validation locale (avant smoke test prod)

**Files:** aucune modification.

**Step 1: tsc**

Run: `npx tsc --noEmit 2>&1 | tail -5; echo EXITCODE=$?`
Expected: `EXITCODE=0`.

**Step 2: vitest**

Run: `npm test 2>&1 | grep "ℹ pass\|ℹ fail" | tail -2`
Expected: `pass 684`, `fail 1`.

**Step 3: RLS tests** (utilisateur — Docker requis)

L'utilisateur lance :
```bash
# Vérifier docker
docker ps

# Si Supabase pas démarré
supabase start

# Lancer les tests RLS
npm run test:rls
```

Expected: tous les tests RLS pass, incluant le nouveau `get_coach_kpis.test.ts`.

**Step 4: Vérifier que la fonction existe en prod**

Run via MCP :
```
mcp__plugin_supabase_supabase__execute_sql({
  project_id: "fscnobivsgornxdwqwlk",
  query: "select proname, count(*) from pg_proc where proname = 'get_coach_kpis' group by proname;"
})
```
Expected: 1 row, count = 1.

**Critère de réussite Task 8:** tous les checks verts. Prêt pour smoke test prod.

---

## Task 9 — Documentation §223 + commit final

**Files:**
- Modify: `docs/implementation-log.md` (ajouter entrée §223 en tête, après stash du §215 user)
- Modify: `docs/ROADMAP.md` (Dernière mise à jour)
- Modify: `CLAUDE.md` (Dernier § livré)
- Modify: `docs/claude/files-map.md` (nouveau coach-kpis.ts)

**Step 1: Stash le travail user**

```bash
mkdir -p /tmp/eac-stash
cp /Users/francoiswagner/Antigravity/Project-EAC/competition/docs/implementation-log.md /tmp/eac-stash/impl-log-with-user-215.md
git -C /Users/francoiswagner/Antigravity/Project-EAC/competition checkout HEAD -- docs/implementation-log.md
```

**Step 2: Ajouter §223 en tête de impl-log.md**

```markdown
## §223 — RPC `get_coach_kpis` côté Postgres (Refacto C) (2026-05-08)

**Contexte :** Refacto C de l'audit §214. `Coach.tsx:1034-1141` faisait 2N requêtes (sessions + strength) par athlète sur la home coach. Pour `topAthletes.slice(0, 5)` (max 5 athlètes) : 2-10 round-trips à chaque navigation home.

**Architecture :**

- Migration `00157_get_coach_kpis_rpc.sql` (NEW) : fonction Postgres `get_coach_kpis(athlete_ids int[], from_date date, to_date date)` retournant `setof (athlete_id int, fatigue_values numeric[])`. `security invoker` → RLS héritée des policies existantes sur `dim_sessions` et `strength_session_runs`. Pas de bypass.
- `src/lib/api/coach-kpis.ts` (NEW) : wrapper TS `getCoachKpis(ids, from, to)` retourne `Map<athleteId, number[]>`.
- `src/lib/api/index.ts` : re-export `getCoachKpis`.
- `Coach.tsx:1034-1141` : queryFn ~110 LOC → ~30 LOC. Logique client (`buildFatigueRating`/`normalizeFatigueValue`/threshold/sort) intacte.

**Cleanup bonus YAGNI :**

- Suppression de `mostLoadedAthlete`, `formeScores`, `loadScore`, `formeScore` (calculés mais 0 consumer post-grep).
- Suppression des helpers `getRunTimestamp` et `getRunFatigueValue` devenus inutilisés (logique migrée en SQL).

**Tests :**

- `npx tsc --noEmit` clean.
- `npm test` 684 pass + 1 fail pré-existant.
- `npm run test:rls` : nouveau test `supabase/tests/rls/get_coach_kpis.test.ts` valide les 3 cas (coach voit ses athlètes, coach voit 0 pour athlètes externes, athlète voit 0 pour autres athlètes).

**Bénéfice net :**

- 2-10 round-trips → 1 round-trip sur la home coach.
- ~600-700 ms gagnés en 4G coach mobile (mesure indicative, dépend du nombre d'athlètes).
- `Coach.tsx` : -80 LOC sur `coachKpisQuery` + dead code retiré.

**Hors scope §223 :**

- Pas de modification de `buildFatigueRating`/`normalizeFatigueValue`/seuils.
- `mostLoadedAthlete`/`formeScores` retirés (YAGNI).
- Refacto D (trio Records), helper `assertSupabase<T>()`, dead code `seedDemoData`/`resetCache` reportés.

**Fichiers** : Créés : `supabase/migrations/00157_get_coach_kpis_rpc.sql`, `src/lib/api/coach-kpis.ts`, `supabase/tests/rls/get_coach_kpis.test.ts`. Modifiés : `src/pages/Coach.tsx`, `src/lib/api/index.ts` + types Supabase regenérés. **Doc** : `docs/plans/2026-05-08-coach-kpis-rpc-design.md` (déjà commité), `docs/plans/2026-05-08-coach-kpis-rpc.md`, `docs/implementation-log.md`, `docs/ROADMAP.md`, `CLAUDE.md`, `docs/claude/files-map.md`.
```

**Step 3: Mettre à jour ROADMAP.md, CLAUDE.md, files-map.md**

Patterns identiques à §216/§217/§218/§219 (déjà commités). Lire ces commits pour le format si besoin.

**Step 4: Restaurer le travail user §215**

Lire `/tmp/eac-stash/impl-log-with-user-215.md`, extraire la section §215 (lignes ~7-52), la coller dans le nouveau impl-log.md APRÈS l'entry §219 (chronologique inverse).

**Step 5: Commit + push**

```bash
git add docs/implementation-log.md docs/ROADMAP.md CLAUDE.md docs/claude/files-map.md \
        supabase/migrations/00157_get_coach_kpis_rpc.sql \
        src/lib/api/coach-kpis.ts \
        src/lib/api/index.ts \
        src/pages/Coach.tsx \
        supabase/tests/rls/get_coach_kpis.test.ts \
        docs/plans/2026-05-08-coach-kpis-rpc.md \
        [+ types Supabase regénérés si fichier créé]

git commit -m "feat(§223): RPC get_coach_kpis (Refacto C audit §214)

[message complet — voir CLAUDE.md style]
"

git push
```

**Step 6: Cleanup stash**

```bash
rm -rf /tmp/eac-stash
```

---

## Critères de validation finale

Avant de marquer §223 fait :

- [ ] Migration `00157_get_coach_kpis_rpc.sql` appliquée en prod via MCP
- [ ] Fonction `get_coach_kpis` invocable via SQL test (Task 3 Step 3)
- [ ] `npx tsc --noEmit` exit 0
- [ ] `npm test` 684 pass + 1 fail attendu
- [ ] `npm run test:rls` pass (utilisateur lance avec Docker)
- [ ] Smoke test prod : `/coach` home charge, alertes fatigue identiques (à comparaison près)
- [ ] DevTools Network : 1 seul appel `rpc/get_coach_kpis` au lieu de 2-10 GETs
- [ ] Dead code grep : 0 occurrence de `mostLoadedAthlete\|formeScores\|loadScore\|formeScore` dans `src/`
- [ ] Documentation §223 ajoutée à 4 fichiers + entry impl-log
- [ ] 1 commit unique `feat(§223): …` sur main + push
- [ ] Workflow GH Pages green

## Risques connus & mitigations

| Risque | Mitigation |
|---|---|
| Schéma `strength_session_runs` mal anticipé (`fatigue` colonne vs `raw_payload`) | Task 1 vérifie via MCP `list_tables` avant d'écrire la migration |
| Migration appliquée mais erreur SQL silencieuse | Task 3 Step 3 smoke test SQL avant de continuer |
| RLS pas testée → régression silencieuse | Task 6 ajoute le test, utilisateur valide en Task 8 |
| Behavior change sur `fatigueAlerts` (athlètes différents en alerte) | Smoke test prod compare avant/après |
| Dead code suppression casse subtilement | Step 5 grep résiduel + tsc clean |
| Types Supabase non régénérés → API wrapper TS errors | Task 4 + Task 5 Step 3 |
| User n'a pas Docker / pas de RLS test | Task 8 Step 3 demande explicitement à l'utilisateur ; si refus, accepté avec note |
