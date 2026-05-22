# Design — Métrique d'intensité par exercice (hauteur cm / distance cm / temps s)

**Date** : 2026-05-22
**Auteur** : François
**Statut** : Design validé, prêt pour writing-plans

## Contexte

Aujourd'hui, tout exercice de musculation se loggue avec une charge en **kg** (colonne `strength_set_logs.weight`), et l'intensité prescrite par le coach passe par un **% du 1RM**. Le §297 a ajouté un flag `is_bodyweight` qui masque entièrement la charge pour les exos au poids de corps (pompes, tractions…).

Problème : certains exercices ne se mesurent ni en kg ni en "reps seules". Pour un **Box Jump**, l'intensité utile et la progression se mesurent par la **hauteur de la box sautée (cm)**. De même :
- **Saut en longueur**, lancers → **distance (cm)**
- **Gainage**, sprints → **temps (s)**

Le catalogue contient déjà plusieurs plyos concernés : Box Jump (id 8), Drop Jump to Stick (56), Saut en longueur (21), etc.

## Objectif

Permettre, par exercice, de choisir la **métrique d'intensité** parmi `weight_kg | height_cm | distance_cm | time_s`, et que toute la chaîne (catalogue coach → builder → runner nageur → progression) s'adapte à cette métrique.

## Non-objectifs (limites V1 assumées)

- **Pas de détection de record (PR)** pour les métriques non-poids — pas de toast "nouveau record de hauteur". On stocke et on affiche la progression, mais la détection de PR reste réservée au poids (Epley). Reportable à une V2.
- Pas de conversion d'unités (toujours cm, jamais inch ; toujours s, jamais min:s).
- Pas de % d'un "max hauteur" — la cible coach est une valeur **absolue** (60 cm), pas un pourcentage.
- Une seule dimension d'intensité par exercice (pas de "Box Jump lesté = hauteur + kg").

## Décisions de design

| Question | Choix retenu |
|---|---|
| Scope | Pattern réutilisable via un enum `intensity_metric` au catalogue (pas un hardcode Box Jump) |
| Métriques V1 | `weight_kg` (défaut), `height_cm`, `distance_cm`, `time_s` |
| Stockage de la valeur loggée | Réutiliser `strength_set_logs.weight` (sémantiquement "load primaire", unité portée par l'exo) — zéro migration sur les logs |
| Cible coach | Optionnelle, valeur absolue dans `strength_session_items.target_intensity` |
| PR / 1RM sur métriques non-poids | Désactivés (gating strict — éviter de polluer les records 1RM) |

## Architecture

### 1. Data layer

**Migrations** (via MCP Supabase, numéro à incrémenter depuis le dernier en place) :
```sql
-- A) Métrique d'intensité au catalogue
ALTER TABLE dim_exercices
ADD COLUMN IF NOT EXISTS intensity_metric TEXT NOT NULL DEFAULT 'weight_kg'
  CHECK (intensity_metric IN ('weight_kg','height_cm','distance_cm','time_s'));

-- B) Cible absolue prescrite par le coach (métriques non-poids)
ALTER TABLE strength_session_items
ADD COLUMN IF NOT EXISTS target_intensity DOUBLE PRECISION;
```

**Stockage de la valeur** : `strength_set_logs.weight` réutilisée. `60` = 60 kg / 60 cm / 60 s selon `exercise.intensity_metric`. Aucune migration sur cette table.

**Types TS** :
- `Exercise.intensity_metric?: 'weight_kg' | 'height_cm' | 'distance_cm' | 'time_s'`
- `StrengthSessionItem.target_intensity?: number | null`
- Mappers mis à jour : `mapDbExerciseToApi` / `mapApiExerciseToDb` / `normalizeExercise` (dim_exercices) ; le mapping des `strength_session_items` (lecture `getStrengthSessions`, écriture builder).

**Constante partagée** — `src/lib/strength/intensityMetrics.ts` :
```ts
export type IntensityMetric = 'weight_kg' | 'height_cm' | 'distance_cm' | 'time_s';

export const INTENSITY_METRICS: Record<IntensityMetric, {
  label: string;       // libellé de la tile / champ
  unit: string;        // suffixe affiché
  tracksOneRm: boolean;// déclenche l'estimation 1RM + le OneRmGate ?
  hasBodyweight: boolean; // propose le bouton PDC ?
  selectLabel: string; // libellé dans le Select coach
  max: number;         // borne haute de saisie
}> = {
  weight_kg:   { label: 'Charge',   unit: 'kg', tracksOneRm: true,  hasBodyweight: true,  selectLabel: 'Charge (kg)',   max: 1000 },
  height_cm:   { label: 'Hauteur',  unit: 'cm', tracksOneRm: false, hasBodyweight: false, selectLabel: 'Hauteur (cm)',  max: 300  },
  distance_cm: { label: 'Distance', unit: 'cm', tracksOneRm: false, hasBodyweight: false, selectLabel: 'Distance (cm)', max: 500  },
  time_s:      { label: 'Temps',    unit: 's',  tracksOneRm: false, hasBodyweight: false, selectLabel: 'Temps (s)',     max: 3600 },
};

export function formatIntensity(value: number | null | undefined, metric: IntensityMetric): string {
  // "60 kg" | "60 cm" | "30 s" | "—"
}
```

### 2. UI Coach

**Catalogue (`StrengthCatalog.tsx`)** — dans les 2 dialogs (création + édition) :
- Un `Select` "Métrique d'intensité" (4 options via `INTENSITY_METRICS[*].selectLabel`), défaut `weight_kg`.
- Quand `≠ weight_kg` : griser `ExerciseCycleTabs` (les %1RM ne s'appliquent pas) ; masquer la checkbox PDC (une seule dimension d'intensité).

**Builder (`StrengthSessionBuilder` / `StrengthExerciseCard`)** :
- Pour un item dont l'exo a `intensity_metric ≠ weight_kg` : remplacer le champ "%1RM" par **"Cible (unité)"** (label dynamique) → écrit `target_intensity`. Vide autorisé.

### 3. WorkoutRunner

Dérivation :
```ts
const metric = (currentExerciseDef?.intensity_metric ?? 'weight_kg') as IntensityMetric;
const metricCfg = INTENSITY_METRICS[metric];
const tracksWeight = metric === 'weight_kg';
```

**Précédence de la tile "load"** :
1. `is_bodyweight === true` (uniquement exos `weight_kg`) → tile masquée, reps seules (§297 inchangé).
2. Sinon → tile affichée, label/unité = `metricCfg`. Bouton PDC seulement si `metricCfg.hasBodyweight`.

**Valeur cible** :
```ts
const targetValue = tracksWeight
  ? (hasPercent ? Math.round(rm * percentValue / 100) : 0)
  : (currentBlock?.target_intensity ?? 0);
```
Pré-remplit la tile et alimente les suggestions du numpad (`target ± incréments`).

**Gating 1RM / PR (correction critique)** — pour `metric ≠ weight_kg` :
- `detectPR` et le calcul `oneRmEstimate` gardés par `if (tracksWeight && !isBodyweight(...))`.
- `logStrengthSet` (`strength.ts`) reçoit un flag `skip_one_rm?: boolean` (mis à `true` par le caller quand `metric ≠ weight_kg`). Le gate interne devient `if (isBodyweight(weight) || payload.skip_one_rm) → estimate = null`. Couvre les 2 chemins (RPC Supabase + fallback localStorage).

**Bornes numpad** : `metricCfg.max` par métrique (height 300, distance 500, time 3600, weight 1000).

**OneRmGate** : `computeMissing1RmExercises` exclut désormais aussi `intensity_metric ≠ 'weight_kg'` (en plus du filtre `is_bodyweight` du §297).

### 4. Progression & historique

**`ExerciseProgressChart.tsx`** : aujourd'hui centré "1RM estimé kg". Pour `metric ≠ weight_kg` :
- Ligne principale = **meilleure valeur par séance** (max `weight` brut) au lieu du 1RM estimé.
- Titre/axe/tooltips adaptés via `metricCfg` ("Meilleure hauteur", unité `cm`…).
- Bloc "volume kg" masqué (volume en cm/s n'a pas de sens).
- `weight_kg` strictement inchangé.

**Résumés (`SessionSummary`, `RestPerfsTab`, `RestSessionTab`)** : exclure les logs non-poids du calcul "volume kg" (comme déjà fait pour `BODYWEIGHT_SENTINEL`) et afficher via `formatIntensity` (`"60 cm × 5"`).

## Edge cases

| Cas | Comportement |
|---|---|
| Exo `height_cm` lancé sans cible coach | Tile vide, athlète saisit librement, log stocké dans `weight` |
| Exo `height_cm` qui avait un `pct_1rm` résiduel | Ignoré (jamais de gate, jamais de target via 1RM) |
| Box Jump loggé à 60 (cm) | `skip_one_rm=true` → aucun 1RM/PR créé. Vérifié dans `strength.ts` ET WorkoutRunner. |
| Coach bascule un exo de `weight_kg` → `height_cm` après des logs kg | Les logs historiques restent en base ; le chart les ré-interprète comme cm (limite connue, rare ; documentée). |
| `is_bodyweight=true` ET `intensity_metric=height_cm` | Impossible par construction : la checkbox PDC est masquée dès que `metric ≠ weight_kg`. Précédence runner protège quand même (is_bodyweight prime, mais on garde la cohérence côté catalogue). |

## Testing

- **Unit** : mappers round-trip `intensity_metric` (dim_exercices) + `target_intensity` (session_items) ; cohérence `INTENSITY_METRICS` (clés = enum) ; `formatIntensity` ; `computeMissing1RmExercises` exclut les métriques non-poids.
- **Gating** : `logStrengthSet` avec `skip_one_rm=true` → pas d'`update1RM`.
- Tous en `node:test` (le `npm test` du projet utilise `node:test`, pas vitest — cf. §297).
- **RLS** : aucune policy touchée (colonnes seulement) → `npm run test:rls` non requis.

## Fichiers impactés (estimation)

| Fichier | Changement |
|---|---|
| `supabase/migrations/00XXX_intensity_metric.sql` | Nouveau — 2 ALTER TABLE |
| `src/lib/strength/intensityMetrics.ts` | Nouveau — enum + config + formatIntensity |
| `src/lib/api/types.ts` | `intensity_metric` sur Exercise, `target_intensity` sur StrengthSessionItem |
| `src/lib/api/client.ts` / `helpers.ts` | Mappers dim_exercices |
| `src/lib/api/strength.ts` | Mapping session_items (lecture/écriture) + flag `skip_one_rm` dans logStrengthSet |
| `src/pages/coach/StrengthCatalog.tsx` | Select métrique + grisage %1RM/PDC conditionnel |
| `src/components/coach/strength/StrengthExerciseCard.tsx` (+ builder) | Champ "Cible (unité)" conditionnel |
| `src/components/strength/WorkoutRunner.tsx` | Tile adaptative, targetValue, gating PR/1RM, bornes |
| `src/lib/strength/missing1rmFilter.ts` | Exclure métriques non-poids |
| `src/components/strength/ExerciseProgressChart.tsx` | Courbe "meilleure valeur" + labels adaptés |
| `src/components/strength/SessionSummary.tsx` / `RestPerfsTab.tsx` / `RestSessionTab.tsx` | Volume kg exclut non-poids + affichage `formatIntensity` |
| Tests (`__tests__/`) | mappers, intensityMetrics, missing1rmFilter, gating |

## Suite

Invoquer `writing-plans` pour produire le plan d'implémentation étape par étape.
