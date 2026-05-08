# §220 — RPC `get_coach_kpis` côté Postgres (Refacto C)

*Date : 2026-05-08 — Suite §219 (kill façade api.ts), §218 (drawer perf), §216 (Dashboard split), §214 (audit perf/maintenabilité).*

## Contexte

`Coach.tsx:1034-1141` (`coachKpisQuery`) fait **2N requêtes Supabase pour N athlètes** sur la home coach :

```ts
await Promise.all(
  topAthletes.map(async (athlete) => {
    const [sessions, strength] = await Promise.all([
      getSessions(athlete.display_name, athlete.id),
      getStrengthHistory(athlete.display_name, { athleteId, limit: 50, from, to }),
    ]);
    // ... per-athlete aggregation client-side
  }),
);
```

Pour un coach avec 20 nageurs : **40 round-trips REST** sur la home, ~800 ms en 4G. Le calcul (fatigueAlerts) est le seul réellement consommé — `mostLoadedAthlete` et `formeScores` sont retournés mais jamais lus par les composants enfants (vérifié par grep).

L'audit perf §214 a classé ce hot path comme un Refacto C dédié. Voici la livraison.

## Décisions de design

### Approche retenue

**Flat per-athlete + RPC unique** (validé par l'utilisateur). Le RPC retourne les valeurs de fatigue brutes (DB scale 1-10) par athlète, le client garde les helpers existants `buildFatigueRating`/`normalizeFatigueValue`/threshold/sort.

Trade-off accepté :
- ✅ Risque le plus faible : 0 changement de formule, 0 changement de seuil.
- ✅ 1 round-trip au lieu de 2N.
- ✅ Logique client préservée (battle-tested).
- ⚠️ Le RPC est un peu "dumb" (juste agrégation de valeurs) — c'est intentionnel.

### Cleanup bonus (YAGNI)

Le `coachKpisQuery` actuel calcule `mostLoadedAthlete`, `formeScores`, `loadScore`, `formeScore` — **aucun n'est consommé** par les composants enfants. Vérifié par :
```bash
grep -rn "mostLoadedAthlete\|formeScores" src/ --include="*.ts" --include="*.tsx"
# Seules les 5 occurrences dans Coach.tsx (déclaration + return), 0 consumer.
```

Per CLAUDE.md "Don't add features beyond what the task requires" + YAGNI, ce dead code est supprimé en bonus du §220. La logique du queryFn passe de ~110 LOC à ~30 LOC.

### Architecture

```
supabase/migrations/00157_get_coach_kpis_rpc.sql  ← NEW
└── function public.get_coach_kpis(
      athlete_ids int[],
      from_date date,
      to_date date
    ) returns table (athlete_id int, fatigue_values numeric[])
    language sql stable security invoker
    set search_path = public

src/lib/api/coach-kpis.ts                         ← NEW (~30 LOC)
└── export async function getCoachKpis(
      athleteIds: number[],
      fromDate: string,
      toDate: string,
    ): Promise<Map<number, number[]>>

src/lib/api/index.ts                              ← +1 re-export ligne

src/pages/Coach.tsx:1034-1141                     ← simplifié à ~30 LOC
└── coachKpisQuery utilise getCoachKpis() unique au lieu de 2N requêtes
```

### Sécurité & RLS

- **`security invoker`** : la fonction tourne avec les privilèges du caller. Les policies RLS existantes sur `dim_sessions` et `strength_session_runs` s'appliquent → un coach ne voit que les athlètes qu'il peut déjà lire individuellement (pas de bypass).
- **Pas de helper `app_user_role()`/`app_user_id()` dans la fonction** — pas nécessaire car SECURITY INVOKER hérite des permissions.
- Validation : `npm run test:rls` (Docker + Supabase local) — règle CLAUDE.md (touche 2 tables sous RLS).

### Source de fatigue (parité JS)

Le RPC doit reproduire la logique JS actuelle :

```ts
// Sessions :
const sessionFatigueValues = recentSessions
  .map((session) => session.fatigue ?? session.feeling)
  .filter((value): value is number => Number.isFinite(value));

// Runs :
const runFatigueValues = recentRuns
  .map((run) => getRunFatigueValue(run))  // run.fatigue ?? run.raw_payload?.fatigue
  .filter((value): value is number => value != null);

// Combiné :
const fatigueRating = buildFatigueRating([...sessionFatigueValues, ...runFatigueValues]);
```

Équivalent SQL (à confirmer par l'implementer via `list_tables` MCP) :

```sql
-- Sessions
select s.athlete_id, coalesce(s.fatigue, s.rpe) as v
from dim_sessions s
where s.athlete_id = any(athlete_ids)
  and s.session_date between from_date and to_date
  and coalesce(s.fatigue, s.rpe) is not null

-- Runs
select r.athlete_id,
  coalesce(r.fatigue, nullif(r.raw_payload->>'fatigue', '')::numeric) as v
from strength_session_runs r
where r.athlete_id = any(athlete_ids)
  and coalesce(r.completed_at, r.started_at, r.date::timestamptz, r.created_at)
      between from_date::timestamptz and (to_date + interval '1 day')::timestamptz
  and (r.fatigue is not null or r.raw_payload->>'fatigue' is not null)
```

**Vérification critique** : l'implementer doit confirmer le schéma exact via Supabase MCP `list_tables` avant d'écrire la migration. Notamment :
- Existence de `dim_sessions.fatigue` (vs `feeling` legacy ?)
- Existence de `strength_session_runs.fatigue` numeric vs JSONB `raw_payload->>fatigue`
- Type de `strength_session_runs.date` (date vs timestamptz)

### Bénéfice net

- 40 round-trips → 1 round-trip pour un coach 20 nageurs (~800 ms → ~150 ms en 4G).
- Coach.tsx allégé : queryFn de ~110 LOC → ~30 LOC + suppression du dead code (loadScore/formeScore/mostLoadedAthlete/formeScores).
- 1 nouveau fichier sub-module API (~30 LOC) + 1 migration SQL (~50 LOC) + 1 re-export.

### Risques & mitigations

| Risque | Mitigation |
|---|---|
| Schéma `strength_session_runs` mal anticipé | `list_tables` MCP avant d'écrire la migration. Si `fatigue` n'est pas une colonne directe, ajuster sur `raw_payload->>'fatigue'`. |
| Behavior change sur `fatigueAlerts` (athlètes différents apparaissent en alerte) | Smoke test prod : avant/après comparer les 3 alertes affichées. Si différence, ne pas push. |
| Migration mal appliquée → rollback | Migration via MCP `apply_migration` (atomique). READ-ONLY function : pas de DDL destructif, juste `CREATE OR REPLACE FUNCTION`. Rollback = `DROP FUNCTION`. |
| Date filter sur runs ≠ JS `getRunTimestamp` | Spec : `coalesce(completed_at, started_at, date::timestamptz, created_at)` — même priorité que JS. |
| RLS test ne couvre pas `dim_sessions`/`strength_session_runs` | L'implementer vérifie `supabase/tests/rls/` ; si absent, signale (out of scope §220 = ne pas étendre le harness). |
| Dead code suppression casse subtilement | grep résiduel `mostLoadedAthlete\|formeScores\|loadScore\|formeScore` dans `src/` après cleanup → 0 résultats avant commit. |

### Validation

- `npx tsc --noEmit` exit 0
- `npm test` 684 pass + 1 fail pré-existant
- `npm run test:rls` (Docker required — utilisateur lance)
- Smoke test prod : `/coach` home charge, alertes fatigue identiques (à comparaison près)
- `gh run list` workflow Deploy green
- DevTools Network : 1 seul appel `rpc/get_coach_kpis` au lieu de 40 GETs

### Out of scope §220

- Pas de modification de la formule `buildFatigueRating`/`normalizeFatigueValue`.
- Pas de migration des seuils (`FATIGUE_ALERT_HIGH_THRESHOLD`, `FATIGUE_ALERT_MAX_THRESHOLD`, `FATIGUE_ALERT_MIN_SAMPLES`).
- `mostLoadedAthlete`/`formeScores`/`loadScore`/`formeScore` retirés (dead code, YAGNI bonus).
- Pas d'extension du harness `npm run test:rls` (si la couverture manque, juste signaler).
- Refacto D (trio Records), helper `assertSupabase<T>()`, `seedDemoData` deletion → § dédiés.
