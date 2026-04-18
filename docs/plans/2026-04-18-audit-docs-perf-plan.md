# Audit docs + perf — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Réduire les tokens consommés au démarrage (CLAUDE.md -67%), améliorer la performance frontend (staleTime, memo, select ciblés) et backend (index cron, consolidation RLS, drop unused indexes).

**Architecture:** 3 chantiers indépendants (A docs, B frontend, C backend) exécutés séquentiellement dans cet ordre. Chaque chantier est auto-contenu, commité séparément, réversible individuellement.

**Tech Stack:** React 19, TypeScript, Vite 7, React Query 5, Supabase PostgreSQL (MCP plugin), Vitest.

**Design :** voir `docs/plans/2026-04-18-audit-docs-perf-design.md`.

---

## Chantier A — Restructuration docs (gain tokens -67%)

### Task A1 : Mesurer état actuel et préparer fichier cible

**Files:**
- Read: `CLAUDE.md`

**Step 1: Mesurer baseline**

```bash
wc -l CLAUDE.md
wc -c CLAUDE.md
```

Noter les valeurs (baseline : 506 lignes / ~42 Ko).

**Step 2: Vérifier qu'il n'y a pas déjà de `docs/claude/` dir**

```bash
ls docs/claude/ 2>&1 || echo "DIR_MISSING"
```

Expected: `DIR_MISSING` (on va la créer).

---

### Task A2 : Créer `docs/claude/files-map.md` avec tableau détaillé

**Files:**
- Create: `docs/claude/files-map.md`

**Step 1: Extraire le tableau "Fichiers clés" de CLAUDE.md lignes ~22-236**

Copier le tableau **intégralement** depuis CLAUDE.md (la section "## Fichiers clés" + son tableau complet) dans le nouveau fichier. Ajouter en tête :

```markdown
# Carte des fichiers clés

*Chargé à la demande — ne PAS dupliquer dans `CLAUDE.md`.*

Ce fichier est l'annuaire détaillé des fichiers du projet. Pour les règles de mise à jour, voir `CLAUDE.md` § "Règles de mise à jour".

Convention colonnes : chemin, rôle (1 phrase), taille (mesurée via `wc -l`, jamais estimée).

---

[tableau original ici, inchangé]
```

**Step 2: Vérifier**

```bash
wc -l docs/claude/files-map.md
```

Expected: ~215-220 lignes (la table + en-tête).

**Step 3: Commit**

```bash
git add docs/claude/files-map.md
git commit -m "docs(claude): extract files map to docs/claude/files-map.md

Fichier dédié chargé à la demande. CLAUDE.md sera allégé en conséquence dans le commit suivant.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task A3 : Alléger CLAUDE.md — tableau "Fichiers clés" compact

**Files:**
- Modify: `CLAUDE.md` (section "## Fichiers clés")

**Step 1: Remplacer le tableau détaillé par un tableau compact**

Supprimer le tableau actuel (~140 lignes) et le remplacer par :

```markdown
## Fichiers clés

Annuaire détaillé (140+ fichiers) : **`docs/claude/files-map.md`** — à lire quand tu cherches un fichier précis.

### Hubs & orchestrateurs critiques

| Fichier | Rôle |
|---------|------|
| `src/lib/api.ts` | Façade API (stubs → 14 modules) |
| `src/lib/api/index.ts` | Re-exports centralisés |
| `src/lib/api/client.ts` | Supabase client, utilitaires |
| `src/lib/api/types.ts` | Interfaces TypeScript |
| `src/lib/auth.ts` | Gestion auth, session, rôles |
| `src/lib/schema.ts` | Schéma Drizzle (tables) |
| `src/lib/features.ts` | Feature flags |
| `src/lib/queryClient.ts` | React Query config globale |
| `src/pages/Dashboard.tsx` | Calendrier natation nageur |
| `src/pages/SwimmerHome.tsx` | Home nageur |
| `src/pages/Strength.tsx` | Module musculation nageur |
| `src/pages/Coach.tsx` | Hub coach |
| `src/pages/Admin.tsx` | Hub admin |
| `src/hooks/useDashboardState.ts` | Façade dashboard nageur |
| `src/hooks/useCoachCalendarState.ts` | État calendrier coach |
| `src/hooks/useStrengthState.ts` | État muscu |
| `supabase/tests/rls/` | Tests RLS intégration (voir `docs/rls-testing.md`) |

**Pour tout autre fichier**, lire `docs/claude/files-map.md` (annuaire complet).
```

**Step 2: Vérifier**

```bash
grep -c "^| " CLAUDE.md
```

Expected: ~17 lignes de tableau (vs ~140 avant).

---

### Task A4 : Alléger CLAUDE.md — tableau "Chantiers futurs"

**Files:**
- Modify: `CLAUDE.md` (section "## Chantiers futurs (ROADMAP)")

**Step 1: Supprimer le tableau "Chantiers futurs"**

Remplacer la section complète (99 lignes) par :

```markdown
## Chantiers

**Historique complet (99 chantiers, tous livrés)** : `docs/ROADMAP.md` + `docs/implementation-log.md`.

Dernière entrée en date : §135 (fix triple-comptage km Progress + logs extras invisibles Dashboard).

Pour ajouter un nouveau chantier, suivre le workflow § "Workflow de documentation obligatoire" ci-dessous.
```

**Step 2: Vérifier**

```bash
grep -c "Fait (§" CLAUDE.md
```

Expected: `0` (tous déplacés).

---

### Task A5 : Mettre à jour règles de mise à jour CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (section "### Règles de mise à jour de CLAUDE.md")

**Step 1: Ajouter règle sur `docs/claude/files-map.md`**

Dans la section "### Règles de mise à jour de CLAUDE.md (obligatoires)", remplacer la règle 1 "Tableau 'Fichiers clés'" par :

```markdown
1. **Annuaire de fichiers** — pour CHAQUE fichier touché par le patch :
   - **Nouveau fichier** créé ≥ 150 lignes OU jouant un rôle architectural → **ajouter une ligne** dans `docs/claude/files-map.md`, avec : chemin exact, rôle en 1 phrase, taille mesurée via `wc -l`.
   - **Fichier existant** dont la taille a varié de **> 30 %** → **mettre à jour la taille** dans `docs/claude/files-map.md`.
   - **Fichier supprimé/renommé** → **mettre à jour** `docs/claude/files-map.md`.
   - **Hubs/orchestrateurs critiques** (nouveau module API majeur, nouvelle page principale) → aussi mettre à jour le petit tableau de `CLAUDE.md` § "Hubs & orchestrateurs critiques".
   - **Ne jamais inventer de taille.** Si pas mesurée, ne pas écrire de chiffre.
```

**Step 2: Simplifier la règle 2 (Chantiers futurs)**

Remplacer la règle 2 par :

```markdown
2. **Pour chaque § ajouté à `implementation-log.md`** : ajouter une ligne dans `docs/ROADMAP.md` (plus dans CLAUDE.md). Mettre à jour la phrase "Dernière entrée en date : §N" dans CLAUDE.md § "Chantiers".
```

---

### Task A6 : Mesurer gain et commit final

**Files:**
- Read: `CLAUDE.md`

**Step 1: Mesurer résultat**

```bash
wc -l CLAUDE.md
wc -c CLAUDE.md
```

Expected: ≤ 230 lignes / ≤ 18 Ko (vs 506 / 42 Ko avant → **-55 à -67%**).

**Step 2: Vérifier non-régression**

```bash
grep -c "Ne jamais déployer" CLAUDE.md
grep -c "mcp__plugin_supabase" CLAUDE.md
grep -c "test:rls" CLAUDE.md
```

Expected: chaque grep retourne ≥ 1 (règles critiques préservées).

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): alléger CLAUDE.md de 506 → ~220 lignes (-67% tokens au démarrage)

- Tableau 'Fichiers clés' déplacé vers docs/claude/files-map.md (chargé à la demande)
- Tableau 'Chantiers futurs' supprimé (vit déjà dans ROADMAP.md + implementation-log.md)
- Règles de mise à jour adaptées pour pointer vers docs/claude/files-map.md
- Règles critiques préservées (déploiement, migrations MCP, tests RLS, agents&coût, cache bust)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task A7 : Mettre à jour implementation-log + ROADMAP

**Files:**
- Modify: `docs/implementation-log.md` (ajouter §136)
- Modify: `docs/ROADMAP.md` (ajouter ligne + bump date en tête)

**Step 1: Ajouter §136 dans implementation-log.md**

Lire les dernières entrées pour le format :

```bash
grep -n "^## §13" docs/implementation-log.md | tail -3
```

Ajouter §136 en suivant le format établi (Contexte / Changements / Fichiers modifiés / Tests / Décisions / Limites).

**Step 2: Mettre à jour ROADMAP.md**

Ajouter la ligne correspondante au tableau + bumper `*Dernière mise à jour*` en tête du fichier.

**Step 3: Commit**

```bash
git add docs/implementation-log.md docs/ROADMAP.md
git commit -m "docs: §136 — restructuration CLAUDE.md, -67% tokens au démarrage

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Chantier B — Quick wins performance frontend

### Task B1 : Fix staleTime global + refetchOnWindowFocus

**Files:**
- Modify: `src/lib/queryClient.ts:49-51`

**Step 1: Vérifier l'état actuel**

```bash
grep -n "staleTime\|refetchOnWindowFocus" src/lib/queryClient.ts
```

Expected:
```
49:      refetchOnWindowFocus: false,
51:      staleTime: Infinity,
```

**Step 2: Modifier les defaults**

Remplacer les lignes 48-51 :

```typescript
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      staleTime: Infinity,
```

par :

```typescript
      refetchInterval: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      staleTime: 5 * 60 * 1000, // 5 min — override localement pour data statique
```

**Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no new errors (erreurs pré-existantes dans `*.stories.tsx` acceptables, cf. MEMORY.md).

**Step 4: Tests**

Run: `npm test -- --run`
Expected: all green (hors failing pré-existant `TimesheetHelpers.test.ts` cf. MEMORY.md).

**Step 5: Commit**

```bash
git add src/lib/queryClient.ts
git commit -m "perf(queries): staleTime 5min + refetchOnWindowFocus par défaut

Avant : staleTime Infinity → aucun refetch auto, data périmée au retour de page.
Après : refresh opportuniste quand user revient sur l'app, cache 5min pour éviter thrashing.
Les data 100% statiques (catalogue exercices) peuvent override avec staleTime: Infinity local.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task B2 : Stabiliser queryKey Dashboard

**Files:**
- Modify: `src/pages/Dashboard.tsx:171` (queryKey `["assignments", user]`)

**Step 1: Identifier le problème**

Ligne 171 : `queryKey: ["assignments", user]` + `enabled: !!user` → quand `user` passe de `null` à une valeur, queryKey change, cache invalidé, refetch dupliqué au boot.

**Step 2: Stabiliser**

Vérifier `user` est défini avant query. Regarder les 20 lignes au-dessus pour comprendre d'où vient `user`. Si la query est déjà guardée par `enabled: !!user`, le problème est principalement cosmétique au boot. La vraie fix : s'assurer que `user` est chargé synchroniquement ou que la query n'est émise qu'une fois.

Option simple (minimale) : pas de changement nécessaire si `enabled: !!user` protège déjà. **À vérifier** : dans DevTools Network, ouvrir Dashboard.tsx, voir s'il y a 1 ou 2 calls `/assignments` au boot.

**Step 3: Test manuel**

```bash
npm run dev
```

Ouvrir `http://localhost:8080/#/natation`, DevTools Network → filter "assignments". Expected : 1 seul call, pas 2.

**Step 4: Si 2 calls observés — fix**

Remplacer ligne 170-174 par :

```typescript
  const { data: assignments, isLoading: assignmentsLoading, error: assignmentsError, refetch: refetchAssignments } = useQuery({
    queryKey: ["assignments", userId ?? user],
    queryFn: () => api.getAssignments(user!, userId),
    enabled: !!user,
  });
```

(unifier la queryKey avec celle de `sessions` ligne 165 pour stabilité).

**Step 5: Commit si modifié, sinon skip**

```bash
git add src/pages/Dashboard.tsx
git commit -m "perf(dashboard): unifier queryKey assignments avec sessions (stabilité au boot)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task B3 : Memoïser ExerciseProgressChart

**Files:**
- Modify: `src/components/strength/ExerciseProgressChart.tsx:109`

**Step 1: Lire le fichier**

```bash
grep -n "chartData\|export function\|import React\|from 'react'" src/components/strength/ExerciseProgressChart.tsx | head -10
```

**Step 2: Memoïser chartData**

Ligne 109 : `const chartData = sessions.map((s) => ({ ... }));` → remplacer par :

```typescript
const chartData = React.useMemo(
  () => sessions.map((s) => ({ /* identique */ })),
  [sessions]
);
```

(si `React` n'est pas importé, utiliser `import { useMemo } from "react"` puis `useMemo(...)`).

**Step 3: Wrapper memo**

En bas du fichier, remplacer l'export si direct :

```typescript
export const ExerciseProgressChart = React.memo(ExerciseProgressChartImpl);
```

(renommer la fonction interne en `ExerciseProgressChartImpl`).

**Step 4: Type check + test**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: pas d'erreur nouvelle.

**Step 5: Test manuel**

```bash
npm run dev
```

Ouvrir Progress page, toggle période 3/6/12 mois → pas de flicker perçu, transition fluide.

**Step 6: Commit**

```bash
git add src/components/strength/ExerciseProgressChart.tsx
git commit -m "perf(charts): memoïser chartData + React.memo ExerciseProgressChart

Toggle période ne recrée plus AreaChart + BarChart + Cell() 100x.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task B4 : Remplacer 5 `select('*')` critiques

**Files:**
- Modify: `src/lib/api/swim-logs.ts:13,30`
- Modify: `src/lib/api/wellness.ts:56,72,87`

**Step 1: Pour chaque occurrence, identifier les colonnes consommées**

Pour `swim-logs.ts` ligne 13-30 : `grep -rn "import.*swim-logs\|api.*swim.*log" src/` puis lire le consommateur pour voir quelles colonnes sont utilisées.

Pour `wellness.ts` : même méthode.

**Step 2: Remplacer `.select('*')` par colonnes ciblées**

Exemple pattern (wellness.ts) :

```typescript
// Avant
.select('*')

// Après
.select('id, user_id, date, sleep_hours, stress, mood, rpe_previous, created_at')
```

(Colonnes à adapter selon ce que l'UI consomme réellement.)

**Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: erreurs visibles sur colonnes manquantes → ajouter les colonnes listées par TS.

**Step 4: Test manuel**

```bash
npm run dev
```

Wellness form, sessions detail, swim logs history → vérifier aucun champ `undefined` dans l'UI.

**Step 5: Commit**

```bash
git add src/lib/api/swim-logs.ts src/lib/api/wellness.ts
git commit -m "perf(api): remplacer select('*') par colonnes ciblées (swim-logs, wellness)

-20 à -30% JSON sur requêtes fréquentes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task B5 : Documenter chantier B dans implementation-log

**Files:**
- Modify: `docs/implementation-log.md` (§137)
- Modify: `docs/ROADMAP.md`

**Step 1: Ajouter §137**

Format standard : Contexte / Changements / Fichiers modifiés / Tests / Décisions / Limites.

**Step 2: Commit**

```bash
git add docs/implementation-log.md docs/ROADMAP.md
git commit -m "docs: §137 — quick wins perf frontend (staleTime, memo charts, select ciblés)"
```

---

## Chantier C — Optimisation backend Supabase

### Task C1 : Créer index partiel pour cron "Séance terminée ?"

**Files:**
- Create: `supabase/migrations/00118_session_assignments_notif_index.sql`

**Step 1: Écrire la migration**

```sql
-- Optimise le cron "Séance terminée ?" (104ms/call, 3922 calls/mois)
-- Index partiel sur les assignments non encore notifiés.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_session_assignments_notif_pending
ON session_assignments (training_slot_id, scheduled_date)
WHERE notified_at IS NULL;

COMMENT ON INDEX idx_session_assignments_notif_pending IS
'Partial index pour cron notification fin de séance. Filtre sur notified_at IS NULL → table très réduite.';
```

**Step 2: Appliquer via MCP**

Utiliser `mcp__plugin_supabase_supabase__apply_migration` avec :
- `project_id`: `fscnobivsgornxdwqwlk`
- `name`: `00118_session_assignments_notif_index`
- `query`: contenu du fichier

⚠️ `CREATE INDEX CONCURRENTLY` ne peut pas tourner dans une transaction. Si l'apply échoue, utiliser `execute_sql` directement.

**Step 3: Vérifier création**

```sql
-- execute_sql
SELECT indexname FROM pg_indexes WHERE tablename='session_assignments' AND indexname='idx_session_assignments_notif_pending';
```

Expected: 1 row.

**Step 4: Commit**

```bash
git add supabase/migrations/00118_session_assignments_notif_index.sql
git commit -m "perf(db): index partiel cron notif 'Séance terminée'

Avant : 104ms/call, 3922 calls/mois → 406s cumulés.
Après : scan limité aux ~dizaines d'assignments en attente notification.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task C2 : Consolider RLS `multiple_permissive_policies` — `push_subscriptions`

**Files:**
- Create: `supabase/migrations/00119_consolidate_rls_push_subscriptions.sql`

**Step 1: Lister les policies actuelles**

Via execute_sql :
```sql
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='push_subscriptions'
ORDER BY cmd, policyname;
```

Expected: 18 warnings → probablement 4-6 policies permissives cumulatives par action.

**Step 2: Écrire migration consolidation**

Pour chaque action (SELECT/INSERT/UPDATE/DELETE), DROP les policies existantes et CREATE une unique permissive combinant les conditions via OR.

Template (à adapter selon ce que révèle le SELECT) :

```sql
-- Drop existing
DROP POLICY IF EXISTS "push_subs_select_own" ON push_subscriptions;
DROP POLICY IF EXISTS "push_subs_select_admin" ON push_subscriptions;
-- ... autres

-- Single consolidated policy
CREATE POLICY "push_subs_select" ON push_subscriptions
FOR SELECT TO authenticated
USING (
  user_id = app_user_id()
  OR app_user_role() IN ('admin','coach')
);
```

**⚠️ IMPORTANT** — utiliser `app_user_id()` / `app_user_role()` (pas `auth.uid()` direct), cf. CLAUDE.md § Migrations.

**Step 3: Appliquer via MCP**

```
mcp__plugin_supabase_supabase__apply_migration(
  project_id: fscnobivsgornxdwqwlk,
  name: 00119_consolidate_rls_push_subscriptions,
  query: <contenu>
)
```

**Step 4: Vérifier advisor**

```
mcp__plugin_supabase_supabase__get_advisors(type: performance)
```

Expected: warnings `multiple_permissive_policies` sur `push_subscriptions` disparus.

**Step 5: Lancer tests RLS** (obligatoire — règle CLAUDE.md)

```bash
docker ps  # vérifier Docker running
npm run test:rls
```

Expected: all green.

**Step 6: Commit**

```bash
git add supabase/migrations/00119_consolidate_rls_push_subscriptions.sql
git commit -m "perf(rls): consolider policies push_subscriptions (18 warnings → 4)

Fusion des policies PERMISSIVE cumulatives en 1 par action avec conditions OR.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task C3 : Consolider RLS — `groups`, `swim_exercise_logs`, `interviews`

**Files:**
- Create: `supabase/migrations/00120_consolidate_rls_groups_logs_interviews.sql`

**Step 1 : Répéter la même méthode que C2 pour les 3 tables**

Pour chaque table, lister policies existantes, DROP, CREATE une consolidée par action.

**Attention** : `interviews` a 6 policies stateful (tests RLS §74-75) — lire `supabase/tests/rls/interviews.test.ts` avant modification pour comprendre la logique multi-phases.

**Step 2 : Apply via MCP**

**Step 3 : Tests RLS obligatoires**

```bash
npm run test:rls
```

Expected: all green. Les tests `interviews.test.ts` (17 assertions) **DOIVENT** passer.

**Step 4 : Vérifier advisors**

Attendu : -60+ warnings `multiple_permissive_policies`.

**Step 5 : Commit**

```bash
git add supabase/migrations/00120_consolidate_rls_groups_logs_interviews.sql
git commit -m "perf(rls): consolider policies groups/swim_exercise_logs/interviews (60 warnings → ~12)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task C4 : Drop 57 unused indexes

**Files:**
- Create: `supabase/migrations/00121_drop_unused_indexes.sql`

**Step 1: Récupérer la liste complète des 57 indexes**

```
mcp__plugin_supabase_supabase__get_advisors(type: performance)
```

Filtrer `unused_index` → extraire noms.

**Step 2: Écrire migration**

```sql
-- Drop 57 indexes jamais utilisés (advisors Supabase).
-- Réversible : chaque index peut être recréé si besoin.

DROP INDEX CONCURRENTLY IF EXISTS idx_users_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_objectives_competition;
-- ... 55 autres
```

**Step 3: ⚠️ Demander confirmation utilisateur avant apply**

Liste les 57 indexes au user. Certains peuvent correspondre à des features récentes pas encore utilisées en prod. **Ne pas apply sans validation humaine**.

**Step 4 : Apply via MCP après validation**

**Step 5 : Vérifier advisor**

Expected : 0 warning `unused_index` après.

**Step 6 : Commit**

```bash
git add supabase/migrations/00121_drop_unused_indexes.sql
git commit -m "perf(db): drop 57 unused indexes (advisor cleanup)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task C5 : Action utilisateur — activer `leaked_password_protection`

**Files:** aucun (action Dashboard Supabase).

**Step 1 : Indiquer à l'utilisateur**

Message :

> Pour activer la protection contre les mots de passe fuités (HaveIBeenPwned) :
> 1. Ouvrir le Supabase Dashboard → Auth → Policies
> 2. Activer "Leaked password protection"
> 3. Ou via URL : https://supabase.com/dashboard/project/fscnobivsgornxdwqwlk/auth/providers
>
> Je ne peux pas le faire depuis le MCP (feature Auth settings seulement Dashboard).

**Step 2 : Attendre confirmation utilisateur**, puis re-lancer `get_advisors(type: security)` pour vérifier que le warning a disparu.

---

### Task C6 : Documenter chantier C

**Files:**
- Modify: `docs/implementation-log.md` (§138)
- Modify: `docs/ROADMAP.md`
- Modify: `CLAUDE.md` § "Chantiers" (bumper "Dernière entrée : §138")

**Step 1 : Ajouter §138**

**Step 2 : Commit final**

```bash
git add docs/implementation-log.md docs/ROADMAP.md CLAUDE.md
git commit -m "docs: §138 — optimisation backend (index cron + consolidation RLS + drop unused)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Critères de succès globaux

| Chantier | Critère | Mesure |
|----------|---------|--------|
| A | CLAUDE.md ≤ 230 lignes | `wc -l CLAUDE.md` |
| A | Règles critiques préservées | 3 grep positifs |
| B | staleTime 5min actif | `grep staleTime src/lib/queryClient.ts` |
| B | Pas de régression tests | `npm test -- --run` all green |
| C | Cron notif ≤ 20ms mean | `pg_stat_statements` après déploiement |
| C | Advisors : 0 warning sur tables consolidées | `get_advisors` |
| C | Tests RLS tous verts | `npm run test:rls` |

---

## Ordre d'exécution

**A → B → C** (validé avec utilisateur).

Commit séparé par task. Chaque chantier est un point de synchronisation (vérifier que tout passe avant d'attaquer le suivant).

---

**Plan complete and saved to `docs/plans/2026-04-18-audit-docs-perf-plan.md`.**
