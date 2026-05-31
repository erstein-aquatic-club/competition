# Design §353 — Marquage de l'échauffement dans la vue exécution nageur

*Date : 2026-05-31 · Reliquat documenté de §351/§352. Statut : design validé (brainstorming), prêt pour `writing-plans`.*

## Contexte

§351/§352 livrent le marquage des 3 blocs d'échauffement (articulaire / mobilité corrective G/D / activation musculaire) **à l'aperçu coach** (`SessionCard` de `MesocyclePreview`). Côté **nageur**, les exos d'échauffement apparaissent dans `MyPlanSessionSheet` (feuille « Mon plan ») et `SessionDetailPreview` (vue détail), mais **sans** les sous-labels articulaire/correctif/activation ni la pastille axe·côté. §353 complète ce marquage.

## Découverte clé (data déjà présente)

Les métadonnées d'échauffement sont **déjà persistées** : `serializeExercise` (§351/§352) écrit `warmup_kind`/`corrective_axis`/`corrective_side` dans `strength_session_items.raw_payload`. Le fetch nageur (`strength_session_items(*)`) ramène `raw_payload` → `StrengthSessionItem.raw_payload` le porte. Les deux composants itèrent `session.items: StrengthSessionItem[]`. **Aucune migration, aucun changement de schéma** : l'UI lit `raw_payload.warmup_kind` directement.

⚠️ La RPC apply dérive `block='warmup'` via une heuristique « items mobility en tête » (§296), antérieure à `warmup_kind` → elle classe à tort en `main` un item d'activation à bucket non-mobility (ex. `glute machine` = `lower_strength`). Lire `warmup_kind` (présent → warmup) **corrige aussi** cette mauvaise classification, sans toucher la RPC.

## Décisions verrouillées

| # | Décision |
|---|----------|
| Approche data | UI lit `raw_payload.warmup_kind` (zéro migration ; source unique cohérente avec l'aperçu ; corrige la classification activation non-mobility) |
| Surfaces | `MyPlanSessionSheet` + `SessionDetailPreview` ; `WorkoutRunner` inchangé |
| Détection warmup | `isWarmup = meta.kind != null \|\| item.block === 'warmup'` (warmup_kind prioritaire, `block` = repli legacy) |
| Rendu | sous-sections par `warmup_kind` (`warmupSectionLabel`) + pastille `correctiveChipLabel` sur les correctifs ; réutilise `BLOCK_STYLES` (même rendu que l'aperçu) |
| Legacy | plans sans `warmup_kind` (pré-§351) → un seul en-tête « Échauffement » (comportement §296 actuel) |

## A. Helper pur (TDD)

`warmupMetaFromItem(item)` (dans `src/lib/strength/warmupLabels.ts`) → `{ kind: WarmupKind | null; correctiveAxis: string | null; correctiveSide: 'left'|'right'|'both' | null }`, lisant `item.raw_payload?.warmup_kind`/`corrective_axis`/`corrective_side` avec **le même garde de validation** que `getMesocycleSessionsContent` (valeurs hors-liste → null ; `raw_payload` absent → tout null). Signature tolérante (accepte `{ raw_payload?: Record<string, unknown> | null }`). Source unique testée.

## B. Rendu (`/frontend-design`)

- **`MyPlanSessionSheet`** (`ItemsList`) : remplacer `i.block === 'warmup'` par `isWarmupItem(i)` (helper) ; dans le groupe warmup, insérer un eyebrow par transition de `meta.kind` (`warmupSectionLabel`) + pastille axe·côté sur les correctifs ; legacy (kind absent) → en-tête unique « Échauffement ».
- **`SessionDetailPreview`** : même logique sur le rendu par index (`isWarmup`/`showWarmupHeader`/`showMainDivider` → basés sur `meta`/`isWarmup`) ; eyebrow de sous-section par `meta.kind` + pastille correctif.
- Réutilise `warmupSectionLabel`/`correctiveChipLabel` (§351) + `BLOCK_STYLES` (sky). Rendu visuel calqué sur l'aperçu coach (cohérence). Vigilance hooks #310 (pas de hook après early return).

## C. Tests

- `warmupLabels.test.ts` (+N) : `warmupMetaFromItem` — common, corrective (+axe/côté), activation, valeurs invalides → null, `raw_payload` null/absent → null.
- `MyPlanSessionSheet.vitest.tsx` (léger) : items avec `raw_payload.warmup_kind` → 3 sous-sections + pastille « côté gauche » ; item legacy (block, sans kind) → en-tête unique.
- Régressions : tsc 0, lint 0, node:test, vitest, build.

## Hors scope

`WorkoutRunner` (mode focus) ; écrans d'édition coach des tables warmup (reliquat séparé).

## Doc

`implementation-log.md` §353 ; ROADMAP ; FEATURES_STATUS ; CLAUDE.md (Dernier § livré) ; files-map (si `warmupLabels.ts` > 30 %) ; mémoire `muscu-bilan-warmup-roadmap` (sous-labels vue exécution livrés → reste écrans d'édition coach).
