# Écrans coach d'édition des routines d'échauffement §354 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permettre au coach d'éditer dans l'app les routines d'échauffement seedées — Bloc 1 (`warmup_common_routine`, liste ordonnée) et Bloc 3 (`warmup_activation_routine`, liste ordonnée par seau) — via un onglet « Échauffement » dans `StrengthCatalog`.

**Architecture:** Deux RPC `SECURITY INVOKER` atomiques (delete+insert) persistent une liste ; l'API JS les appelle ; un composant `WarmupRoutinesEditor` (nouvel onglet) édite les listes localement (↑↓/ajout/retrait) et sauve par section. Édition = prochains plans générés (matérialisés inchangés).

**Tech Stack:** Supabase (migration MCP + RPC + RLS), TypeScript, `node:test` (API) + vitest (composant), React/Tailwind (`/frontend-design`).

**Design :** `docs/plans/2026-05-31-echauffement-edition-coach-routines-design.md`. **Base** : `strength-warmup.ts` (`getCommonWarmupRoutine`/`getActivationRoutine`), tables + RLS coach/admin (mig 00214/00215), pattern RPC `supabase.rpc('name', {args})` (cf. `strength-mesocycles.ts:159`).

**Conventions :** migration via MCP (projet `fscnobivsgornxdwqwlk`) ; `git add` ciblé (checkout partagé — `swimPlanningShared.ts`/`date.ts`/`strengthPlanWeeks.ts` = WIP autre terminal, NE PAS committer) ; runner `node --test --experimental-test-module-mocks --import tsx <file>` ; pas de push sans demande.

---

## Task 1: Migration `00217_warmup_routine_setters.sql` (2 RPC)

**Files:** Create `supabase/migrations/00217_warmup_routine_setters.sql` ; apply via MCP `apply_migration`.

**Step 1: Écrire la migration**
```sql
-- 00217_warmup_routine_setters.sql — §354 setters atomiques des routines warmup.
-- SECURITY INVOKER (défaut) → les policies RLS écriture coach/admin (00214/00215)
-- s'appliquent : un athlète déclenche une erreur RLS sur l'INSERT.

CREATE OR REPLACE FUNCTION set_warmup_common_routine(p_ids int[])
RETURNS void LANGUAGE sql AS $$
  DELETE FROM warmup_common_routine;
  INSERT INTO warmup_common_routine (ordre, exercise_id)
  SELECT (ord - 1)::int, id FROM unnest(coalesce(p_ids, '{}')) WITH ORDINALITY AS t(id, ord);
$$;

CREATE OR REPLACE FUNCTION set_warmup_activation_routine(p_bucket text, p_ids int[])
RETURNS void LANGUAGE sql AS $$
  DELETE FROM warmup_activation_routine WHERE bucket = p_bucket;
  INSERT INTO warmup_activation_routine (bucket, ordre, exercise_id)
  SELECT p_bucket, ord::int, id FROM unnest(coalesce(p_ids, '{}')) WITH ORDINALITY AS t(id, ord);
$$;
```

**Step 2: Appliquer via MCP** (`apply_migration`, name `00217_warmup_routine_setters`). Charger les outils : `ToolSearch select:mcp__plugin_supabase_supabase__apply_migration,mcp__plugin_supabase_supabase__execute_sql`.

**Step 3: Vérifier** via `execute_sql` (en service-role, donc RLS bypass — vérifie juste la mécanique) :
```sql
SELECT set_warmup_common_routine(ARRAY[87,84]);
SELECT ordre, exercise_id FROM warmup_common_routine ORDER BY ordre; -- 0→87, 1→84
SELECT set_warmup_common_routine(ARRAY[97,87,84,24]); -- restaure l'état seedé (Raise 97 en tête)
SELECT ordre, exercise_id FROM warmup_common_routine ORDER BY ordre;
```
⚠️ **Restaurer l'état seedé** après le test mécanique (la commune = [97,87,84,24] ordre 0-3 ; ne pas laisser l'état de test en prod).

**Step 4: Commit**
```bash
git add supabase/migrations/00217_warmup_routine_setters.sql
git commit -m "feat(§354): RPC set_warmup_common_routine + set_warmup_activation_routine (atomiques)"
```

---

## Task 2: Test RLS des RPC

**Files:** Modify `supabase/tests/schema.sql` (ajouter les 2 fonctions, identiques à la migration — les tables `warmup_common_routine`/`warmup_activation_routine` y sont déjà §351/§352) ; Create `supabase/tests/rls/warmup_routine_setters.test.ts`.

Couvrir : **coach** `set_warmup_common_routine([...])` → réécrit les lignes (assert via service-role) ; **athlète** `set_warmup_common_routine([...])` → **rejet RLS** (l'INSERT viole la policy write) + table inchangée (re-check service-role) ; idem `set_warmup_activation_routine('upper_strength', [...])`. Mirror le style des tests RLS existants (`warmup_common_routine.test.ts`). Vérifier Docker (`docker ps`, 1×) + `supabase start` si besoin ; `npm run test:rls`. Valider : affaiblir une policy write → le test athlète passe au VERT (preuve qu'il teste vraiment le refus) puis restaurer.

**Commit:** `git add supabase/tests/schema.sql supabase/tests/rls/warmup_routine_setters.test.ts && git commit -m "test(§354): RLS RPC set_warmup_* (coach autorisé / athlète refusé)"`

---

## Task 3: API `setCommonWarmupRoutine` + `setActivationRoutine` (TDD)

**Files:** Modify `src/lib/api/strength-warmup.ts` + `src/lib/api/__tests__/strength-warmup.test.ts` ; export dans `src/lib/api/index.ts`.

**Step 1: Tests (RED)** — le mock FIFO existant gère `supabase.from`; ajouter le support `supabase.rpc` au mock (capturer nom + args), façon `strength.test.ts` (`rpcCalls`/`rpcResults`). Cas :
- `setCommonWarmupRoutine([97,87,84])` → appelle `supabase.rpc('set_warmup_common_routine', { p_ids: [97,87,84] })`.
- `setActivationRoutine('upper_strength', [74,49])` → `supabase.rpc('set_warmup_activation_routine', { p_bucket: 'upper_strength', p_ids: [74,49] })`.
- Supabase indispo (`canUseSupabase()` false) → no-op (ne jette pas, n'appelle pas rpc).

**Step 2: Implémenter**
```typescript
/** §354 — remplace la routine articulaire commune (Bloc 1) par la liste ordonnée. */
export async function setCommonWarmupRoutine(ids: number[]): Promise<void> {
  if (!canUseSupabase()) return;
  assertSupabase(await supabase.rpc('set_warmup_common_routine', { p_ids: ids }));
}

/** §354 — remplace la routine d'activation (Bloc 3) d'un seau par la liste ordonnée. */
export async function setActivationRoutine(bucket: string, ids: number[]): Promise<void> {
  if (!canUseSupabase()) return;
  assertSupabase(await supabase.rpc('set_warmup_activation_routine', { p_bucket: bucket, p_ids: ids }));
}
```
(Vérifier que `assertSupabase` accepte la forme retour de `.rpc` ; sinon adapter — `.rpc` renvoie `{ data, error }` comme `.from`.)

**Step 3: GREEN** ; export `index.ts` ; tsc 0. **Commit** `feat(§354): API setCommonWarmupRoutine + setActivationRoutine`.

---

## Task 4: UI — onglet « Échauffement » + `WarmupRoutinesEditor` (`/frontend-design`)

> **Règle projet : invoquer `/frontend-design`.**

**Files:** Create `src/components/coach/strength/WarmupRoutinesEditor.tsx` ; Modify `src/pages/coach/StrengthCatalog.tsx` (ajouter l'onglet au `TabsList` de niveau écran + un `TabsContent` qui monte le composant) ; Test `src/components/coach/strength/WarmupRoutinesEditor.vitest.tsx`.

**Composant `WarmupRoutinesEditor`** :
- Props : reçoit le catalogue (liste d'exos `{id, nomExercice}`) — soit en prop depuis `StrengthCatalog` (qui le charge déjà), soit via `listCatalogExercisesTagged` en interne (query `["strength-catalog-tagged"]`).
- Charge `getCommonWarmupRoutine()` (query `["strength-warmup-common"]`) + `getActivationRoutine()` (`["strength-warmup-activation"]`).
- **État local** par liste (`useState<number[]>`), initialisé depuis les queries (via `useEffect` ou `key` de reset) ; flag dirty = liste locale ≠ liste serveur.
- **Section Bloc 1** : items (nom résolu via le catalogue + ↑/↓ + ×), « + Ajouter » → sélecteur recherchable (catalogue complet), bouton « Enregistrer » (disabled si non-dirty) → `useMutation(setCommonWarmupRoutine)` → onSuccess invalide `["strength-warmup-common"]` + toast.
- **Section Bloc 3** : 4 sous-sections (`upper_strength`/`upper_power`/`lower_strength`/`lower_power` — libellés FR via le mapping existant `BUCKET_*`/`STRENGTH_BUCKETS`), chacune même éditeur + « Enregistrer » → `setActivationRoutine(bucket, ids)`, invalide `["strength-warmup-activation"]`.
- Bandeau info : « S'applique aux **prochains** mésocycles générés ».
- **Hooks #310** : tous les hooks (queries, useState, useMutation, useMemo) AVANT tout early return. `/frontend-design` pour le rendu (cohérent catalogue/iOS).

**StrengthCatalog** : localiser la `TabsList` de niveau écran (pas celle du dialog d'édition d'exo) ; ajouter `<TabsTrigger value="warmup">Échauffement</TabsTrigger>` + `<TabsContent value="warmup"><WarmupRoutinesEditor … /></TabsContent>`. Si la `TabsList` a une classe `grid-cols-N`, incrémenter N.

**Tests vitest** : rendre `WarmupRoutinesEditor` avec un QueryClient + données mockées (mock `getCommonWarmupRoutine`/`getActivationRoutine`/`setCommonWarmupRoutine`) → ↑ réordonne (assert ordre DOM), × retire, « Enregistrer » appelle `setCommonWarmupRoutine` avec la liste à jour. Léger. Vigilance #310.

**Commit:** `git add src/components/coach/strength/WarmupRoutinesEditor.tsx src/components/coach/strength/WarmupRoutinesEditor.vitest.tsx src/pages/coach/StrengthCatalog.tsx && git commit -m "feat(§354): onglet Échauffement — éditeur de routines (Bloc 1 + activation par seau)"`

---

## Task 5: Vérification + doc

- `npx tsc --noEmit` 0 ; `npm run lint` 0 erreur ; `npm test` verts ; `npm run build` OK ; `npm run test:rls` (Task 2).
- Doc : `implementation-log.md` §354 ; `ROADMAP.md` (+ date) ; `FEATURES_STATUS.md` ; `CLAUDE.md` (Dernier § livré = §354) ; `files-map.md` (`WarmupRoutinesEditor.tsx` via `wc -l` si ≥150 ; taille `strength-warmup.ts`) ; mémoire `muscu-bilan-warmup-roadmap` (édition coach **livrée** → chantier (8) clos ; reste optionnel = édition per-séance).
- **Commit** doc (targeted). Push uniquement si demandé.

---

## Notes transverses
- RPC `SECURITY INVOKER` → RLS coach/admin enforce l'autorisation (pas de `SECURITY DEFINER`).
- Édition = prochains plans générés ; plans matérialisés inchangés (cohérent avec tout le chantier).
- Sauvegarde par section (granulaire) ; bouton actif seulement si dirty.
- Checkout partagé : `git add` ciblé, jamais `-A`.
