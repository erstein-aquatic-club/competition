# Design §354 — Écrans coach d'édition des routines d'échauffement

*Date : 2026-05-31 · Dernier reliquat du chantier (8). Statut : design validé (brainstorming), prêt pour `writing-plans`.*

## Contexte

§351-353 ont livré la génération + le marquage des 3 blocs d'échauffement, avec des routines **seedées** (`warmup_common_routine` Bloc 1, `warmup_activation_routine` Bloc 3). Le coach ne peut pas encore les éditer dans l'app (seulement via SQL). §354 ajoute les écrans d'édition coach.

## Décisions verrouillées (brainstorming)

| # | Décision |
|---|----------|
| Périmètre | Éditeurs **Bloc 1** (routine articulaire commune) + **Bloc 3** (activation par seau). Tags Bloc 2 (`corrective_axes`/`supports_unilateral`) = hors scope. |
| Emplacement | Nouvel onglet **« Échauffement »** dans `StrengthCatalog` → composant dédié `WarmupRoutinesEditor`. |
| Interactions | Réordonner ↑↓ + retirer (×) + ajouter (sélecteur recherchable sur **tout** le catalogue). |
| Sauvegarde | **RPC atomique** (delete+insert) + bouton **« Enregistrer » par section** (granulaire, actif si modifié). |
| Effet | S'applique aux **prochains** mésocycles générés ; plans déjà matérialisés inchangés. |

## A. Data / API — migration `00217_warmup_routine_setters.sql` (MCP)

Deux RPC **`SECURITY INVOKER`** (les policies RLS écriture coach/admin de §351/§352 s'appliquent donc directement ; pas de `SECURITY DEFINER`), chacune delete+insert **atomique** (une transaction de fonction) :

```sql
CREATE OR REPLACE FUNCTION set_warmup_common_routine(p_ids int[])
RETURNS void LANGUAGE sql AS $$
  DELETE FROM warmup_common_routine;
  INSERT INTO warmup_common_routine (ordre, exercise_id)
  SELECT ord - 1, id FROM unnest(p_ids) WITH ORDINALITY AS t(id, ord);
$$;

CREATE OR REPLACE FUNCTION set_warmup_activation_routine(p_bucket text, p_ids int[])
RETURNS void LANGUAGE sql AS $$
  DELETE FROM warmup_activation_routine WHERE bucket = p_bucket;
  INSERT INTO warmup_activation_routine (bucket, ordre, exercise_id)
  SELECT p_bucket, ord, id FROM unnest(p_ids) WITH ORDINALITY AS t(id, ord);
$$;
```
*(ordre : la commune démarrait à 0 — Raise — ; on conserve `ord-1` pour la commune et `ord` pour l'activation, ou on uniformise — détail d'implémentation sans incidence fonctionnelle car seul l'ordre relatif compte. Le moteur lit `order by ordre`.)*

API JS (`strength-warmup.ts`) : `setCommonWarmupRoutine(ids: number[])` + `setActivationRoutine(bucket: string, ids: number[])` via `supabase.rpc(...)` (no-op gracieux si Supabase indispo). Test RLS dédié : RPC répliquées + tables dans `supabase/tests/schema.sql` ; athlète refusé (RLS write) / coach autorisé.

## B. UI — onglet « Échauffement » dans `StrengthCatalog` (`/frontend-design`)

Nouvel onglet (la `TabsList` passe à N+1) → composant `WarmupRoutinesEditor.tsx` :
- **Section Bloc 1** : liste ordonnée (nom d'exo via le catalogue + ↑↓ + ×) + « + Ajouter » (sélecteur recherchable catalogue complet) + bouton « Enregistrer » (actif si dirty) → `setCommonWarmupRoutine`.
- **Section Bloc 3** : 4 sous-sections par seau (`upper_strength`, `upper_power`, `lower_strength`, `lower_power`), chacune une liste éditable + « Enregistrer » propre → `setActivationRoutine(bucket, ids)`.
- Données : queries existantes `["strength-warmup-common"]` / `["strength-warmup-activation"]` + le catalogue (`listCatalogExercisesTagged` ou la source catalogue déjà chargée par `StrengthCatalog`) pour résoudre les noms et alimenter le picker. État d'édition local (`useState`) ; à la sauvegarde, invalider les clés warmup (l'aperçu reflète aussitôt).
- Bandeau : « S'applique aux prochains mésocycles générés ».
- **Hooks #310** : tous les hooks avant tout early return. `/frontend-design` pour le rendu (cohérent iOS/catalogue).

## C. Tests

- **RLS** (`test:rls`) : `set_warmup_common_routine`/`set_warmup_activation_routine` — coach autorisé, athlète refusé ; réplique RPC + tables dans `schema.sql`.
- **API** (node:test mocké) : `setCommonWarmupRoutine`/`setActivationRoutine` appellent `supabase.rpc` avec le bon nom + args.
- **Composant** (vitest léger) : ↑↓ réordonne localement, × retire, « Enregistrer » appelle l'API avec la liste à jour ; picker ajoute un exo.
- Régressions : tsc 0, lint 0, node:test, vitest, build.

## Hors scope

Tags Bloc 2 (`corrective_axes`/`supports_unilateral`, édition per-exo) ; édition per-séance des warmups d'un plan déjà matérialisé ; réordonnancement drag-and-drop.

## Doc

`implementation-log.md` §354 ; ROADMAP ; FEATURES_STATUS ; CLAUDE.md (Dernier § livré) ; files-map (`WarmupRoutinesEditor.tsx` ≥150 l si applicable, taille `strength-warmup.ts`) ; mémoire `muscu-bilan-warmup-roadmap` (édition coach livrée → chantier (8) clos, reste édition per-séance optionnelle).
