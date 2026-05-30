# Design §351 — Échauffement intelligent piloté par les déficits de mobilité (Blocs 1+2)

*Date : 2026-05-30 · Chantier (8) du backlog terrain (`muscu-bilan-warmup-roadmap`) · Statut : design validé (brainstorming), prêt pour `writing-plans`.*

## Contexte & vision

Retour terrain coach (François) : une séance muscu doit toujours s'ouvrir par un échauffement structuré en 4 blocs :

1. **Échauffement articulaire COMMUN** — générique, identique pour tous les nageurs.
2. **Mobilité SPÉCIFIQUE au nageur** — exercices correctifs générés à partir de SES déficits de mobilité G/D, pour corriger ses restrictions au fil du temps.
3. **Échauffement musculaire SPÉCIFIQUE à la séance** — préchauffe les groupes sollicités par le bloc principal. *(hors scope §351 — voir frontières)*
4. **Séance principale** (existante).

La fondation est posée : la mobilité G/D est mesurée par le bilan coach (§346-348) — `physical_tests` jsonb par axe `{left, right, note?}` 0-3, `effectiveAxisScore = min(G,D)`, sous-score 0 = dysfonction (override sécurité mobilité du moteur). Le moteur génère déjà un bloc « warmup » générique (2 exos du seau `mobility`) en tête de chaque séance.

**§351 livre les Blocs 1 + 2.** Le Bloc 3 et toute l'édition coach (per-séance + écran routine commune) sont reportés à **§352**.

## Décisions verrouillées (brainstorming)

| # | Décision | Raison |
|---|----------|--------|
| Scope | Blocs **1 + 2** dans §351 ; Bloc 3 + éditions → §352 | Slice livrable, exploite la donnée G/D fraîche. |
| Bloc 1 | Routine fixe **seedée** dans une table dédiée (`warmup_common_routine`), seed-only en §351 | Pilotable coach plus tard (écran §352) sans red-déploiement. |
| Bloc 2 | Catalogue **taggé par axe** : `dim_exercices.corrective_axes text[]` | Cohérent avec `contraindication_zones`/`stroke_prehab_affinity` ; pilotable coach. |
| Seuil déficit | `effective = min(G,D) ≤ 1` **OU** `|G−D| ≥ 2` | Corrige les vraies faiblesses ET les déséquilibres latéraux marqués. |
| Volume Bloc 2 | Plafond **`MAX_CORRECTIVE = 2`** + **rotation** des axes entre séances | Échauffement léger (doctrine fraîcheur) ; la rotation couvre tous les axes déficitaires sur la semaine. |
| Timing | **Matérialisé à la génération** (moteur pur, écrit dans les séances) | Cohérent avec §307/§313/§329 ; visible à l'aperçu ; un nouveau bilan → nouveau méso à jour. |
| Contrôle coach | **Indirect** : scores bilan (bloc 2), table routine commune (bloc 1), tags catalogue | Une source de vérité par bloc ; édition per-séance → §352. |
| Intégration | Blocs 1+2 **remplacent** le warmup générique actuel | Une seule logique de warmup, plus intelligente. |
| Types séance | **Développement + amorce PAP** ; PAS l'override mobilité corrective | L'échauffement ne fatigue pas (OK avant sprint) ; l'override est déjà 100 % mobilité. |
| Échauffement vs cap | Blocs 1+2 = section **hors `MAX_SESSION_ITEMS`** | Le cap ne gouverne que primary+complement+core ; le warmup léger ne doit pas rogner le travail. |
| Rotation | Couverture **équitable** sur la semaine (fenêtre glissante depuis le pire axe), déterministe sur l'index de séance | Le moteur est pur — pas de `Date.now`/`random`. |

## A. Data model — migration `00214_warmup_intelligent.sql` (via MCP, projet `fscnobivsgornxdwqwlk`)

1. **`ALTER TABLE dim_exercices ADD COLUMN corrective_axes text[] DEFAULT '{}'`** + seed (UPDATE) des exos du seau `mobility` par axe corrigé (tags exacts validés coach au seed) :
   - `shoulder_flexion` → Shoulder Dislocates (84), Y-T-W épaules (24)
   - `t_spine` → Cat-Cow (87)
   - `hip` → Hip Airplane (59), 90/90 Hip Switch (85), Hip Flexor Stretch (86)
   - `scapula_control` → Serratus Wall Slide (51), Pompe scapulaire (52), Scapula Pull-Up (71), Face Pull (49)
   - `trunk_neck_alignment` → Streamline Hold (83), Cat-Cow (87)
   - `hip_hinge` → Hip Airplane (59), 90/90 Hip Switch (85)

2. **`CREATE TABLE warmup_common_routine (id serial PK, ordre int NOT NULL, exercise_id int NOT NULL REFERENCES dim_exercices(id))`** + RLS (lecture : tous rôles authentifiés ; écriture : coach/admin via `app_user_role()`, aligné sur les policies catalogue). Seed : ~3 exos articulaires génériques **sans contre-indication** (Cat-Cow 87, Shoulder Dislocates 84, Y-T-W 24).

> RLS touchée (nouvelle table) → **`npm run test:rls`** requis. Ajout de `warmup_common_routine` au schéma hand-crafted `supabase/tests/schema.sql` + test de policy.

## B. Couche API

- `src/lib/api/strength-catalog.ts` : `DbRow` + `mapRow` lisent `corrective_axes` → `CatalogExercise.correctiveAxes: string[]` (type étendu dans `mesocycleEngine.types.ts`, défaut `[]`).
- **Nouveau `src/lib/api/strength-warmup.ts`** : `getCommonWarmupRoutine(): Promise<number[]>` (exercise_ids triés par `ordre`) ; fallback `[]` si Supabase indisponible.
- L'orchestrateur d'aperçu (`strength-mesocycles.ts`, chemin preview) injecte `correctiveAxes` (déjà dans le catalogue) + `commonWarmupRoutine` dans le `MesocycleInput`.

## C. Moteur (`mesocycleEngine.ts`, fonctions pures, TDD)

- **`MesocycleInput`** gagne `commonWarmupRoutine: number[]` (ids ordonnés).
- **`deficientAxes(physicalTests)`** (exportée) → axes triés par sévérité (`effective` croissant, puis `|G−D|` décroissant), filtrés `effective ≤ 1 OU |G−D| ≥ 2`. Renvoie aussi le côté faible par axe (pour l'UI). Anciens bilans (G=D) → asymétrie 0, jugés sur `effective`.
- **`buildCommonWarmup(routineIds, catalog, painZones)`** → résout les ids en exos, filtre contre-indications (douleur épaule → saute Shoulder Dislocates), renvoie `SelectedExercise[]`.
- **`selectCorrectiveWarmup(physicalTests, catalog, painZones, level, sessionIndex)`** :
  - calcule `deficientAxes`,
  - **rotation déterministe** : fenêtre glissante de taille `MAX_CORRECTIVE` sur la liste triée, décalée par `sessionIndex` → couvre tous les axes sur la semaine, pires en tête,
  - pour chaque axe retenu : 1ᵉʳ exo catalogue dont `correctiveAxes` contient l'axe, non contre-indiqué, fits-level, **dédupliqué vs Bloc 1**,
  - renvoie `SelectedExercise[]` (≤ `MAX_CORRECTIVE`).
- **`buildSession` / `buildPapSession`** : le warmup générique (`mobilityPool.slice(0, warmupCount)`) est **remplacé** par `[...buildCommonWarmup(...), ...selectCorrectiveWarmup(..., sessionIndex)]`, chargés en activation (`isWarmup=true`, chemin existant). Tags `buckets` inchangés (`mobility`). L'override mobilité corrective conserve son chemin actuel (pas de blocs 1+2).
- **Budget d'items** : l'échauffement (blocs 1+2) est une **section légère hors `MAX_SESSION_ITEMS`** (qui ne gouverne plus que primary+complement+core). Cap échauffement = `routine.length (~3) + MAX_CORRECTIVE (2)`.
- **Déterminisme** : `sessionIndex` global (compteur de séances à travers les semaines) passé depuis `generateMesocycle`/`buildWeek`. Aucun `Date.now`/`random`.

## D. UI / aperçu (`/frontend-design` obligatoire)

L'échauffement étant matérialisé, il apparaît automatiquement dans les écrans qui rendent les exos d'une séance. Travail UI = **marquage** :

- Regroupement visuel sous deux sous-en-têtes : **« Échauffement articulaire »** (Bloc 1) et **« Mobilité corrective »** (Bloc 2), avant le bloc principal.
- Le Bloc 2 affiche **l'axe ciblé + le côté faible** (ex. « Hanche · côté gauche ») — exploite `effectiveAxisScore` + labels FR de `MOBILITY_EVOLUTION_AXES`.
- Badge léger « échauffement » (style activation existant).
- **Aucune nouvelle route / écran** (édition = §352) ; distinction visuelle uniquement.
- Point d'ancrage exact (rendu partagé de la liste d'exos d'une séance matérialisée : `SessionDetailPreview` + vue séance nageur) confirmé à l'implémentation.

## E. Tests (TDD strict)

- **`mesocycleEngine.test.ts`** : `deficientAxes` (seuil ≤1, asymétrie ≥2, tri sévérité, rétrocompat G=D), `selectCorrectiveWarmup` (tag par axe, contre-indication, dédup vs bloc 1, plafond 2, rotation déterministe sur sessionIndex), `buildCommonWarmup` (résolution + filtre), intégration `generateMesocycle` (dév + PAP portent blocs 1+2 ; override mobilité NON).
- **API** : test léger `getCommonWarmupRoutine` (ordre, fallback []).
- **`test:rls`** : policy `warmup_common_routine` (lecture authentifié / écriture coach-admin) + ajout `schema.sql`.
- **Régressions** : node:test complet, vitest, `tsc --noEmit` 0, `npm run build`, `npm run lint`.
- Vigilance hooks (leçon §316/§326/§350) : pas de hook après early return si un composant gagne un `useMemo`.

## F. Frontières de scope (différé → §352)

- Édition per-séance des exos d'échauffement.
- Écran coach d'édition de `warmup_common_routine`.
- **Bloc 3** (activation musculaire des groupes sollicités — nécessite un tagging « groupe musculaire » du catalogue).

## G. Documentation obligatoire (fin de §)

- `implementation-log.md` **§351** ; `ROADMAP.md` (ligne + date) ; `FEATURES_STATUS.md` ; `CLAUDE.md` (ligne « Dernier § livré » + annuaire `files-map.md` : `strength-warmup.ts`, table `warmup_common_routine`, colonne `corrective_axes`).
- Mémoire : MAJ `muscu-bilan-warmup-roadmap` (item 8 partiel : blocs 1+2 faits, bloc 3 + édition restants).
