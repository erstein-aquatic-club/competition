# §186 — Refonte du modèle de calcul des allures (Pace Model v2)

*Design validé conjointement le 2026-05-01. Source de vérité métier : `docs/regles_calcul_allures_natation.docx`. Implémentation à dérouler ensuite via `writing-plans` puis `executing-plans`.*

## 1. Contexte

Le calculateur d'allures livré en §184/§185 utilise un modèle linéaire `t_zone(d) = pace_par_100m × d × pct/100` avec `pct ∈ [105%, 140%]` du temps cible. Ce modèle est trop grossier pour les distances de sprint (où le départ, la vitesse pure et la décélération créent une courbe non-linéaire) et ne reflète pas la spécificité par nage et par épreuve.

Le document `regles_calcul_allures_natation.docx` (audit §1, cohérence vérifiée) propose un modèle non-linéaire paramétré par épreuve-cible, par nage et par contexte. Cette §186 implémente ce modèle.

## 2. Décisions de conception (conflits résolus)

| # | Décision | Justification |
|---|---|---|
| C1 | La table FFN §185 reste en place, comme **couche d'affichage post-calcul** uniquement (transposition 50↔25 pour repère bord de bassin). Le moteur de calcul travaille en référence 50m. | Le doc traite uniquement les courbes en bassin 50m. Les conversions inter-bassins sont un aide à la lecture, pas un input du calcul. |
| C2 | Les coefficients k_allure du doc remplacent les défauts actuels. | Le coach valide la pertinence métier des valeurs du doc. |
| C3 | Bascule directe v1 → v2 sans feature flag. La table `coach_pace_zones` v1 est **droppée et recréée** en schema v2. Les cibles `coach_pace_targets` sont préservées (leur input ne change pas). | Aucun coach n'a réellement calibré ses zones v1 en production (smoke test interne uniquement). Pas de dette à porter. |
| C4 | Zone V4 ajoutée (entre V3 et MAX). Désactivée par défaut sur 400m / 800m / 1500m mais activable manuellement par le coach via toggle dans le drawer Zones. | Doc §4 : V3 (0.96/0.97) → MAX (1.00) suffit comme contraste sur longue distance. V4 reste utile sur 50m/100m. |
| C5 | Calculs internes en **secondes** (float), affichage en `mm:ss.cc`. Stockage DB en **ms** (int) pour cohérence avec le reste de l'app. | Précision suffisante (1 ms < 0.01 s d'affichage). Aligné avec §184. |

## 3. Modèle calculatoire

### 3.1. Formule générale

```
t_allure(d) = (Tobj × R_base(D, d) × A_nage(D, d, S) + Δ_mesure(d)) / k_allure(famille_D, zone)
```

Dérivée en deux étapes :

1. `tMAX(d) = Tobj × R_base(D, d) × A_nage(D, d, S) + Δ_mesure(d)`
2. `t_allure(d) = tMAX(d) / k_allure(famille_D, zone)`

### 3.2. Notations

| Symbole | Définition | Type/unité |
|---|---|---|
| `Tobj` | Temps objectif compétition | secondes (float) |
| `D` | Distance épreuve-cible (50, 100, 200, 400, 800, 1500) | mètres |
| `d` | Distance répétition d'entraînement | mètres |
| `S` | Nage (`crawl`, `dos`, `brasse`, `papillon`, `4N`) | enum |
| `R_base(D, d)` | Ratio MAX (part de Tobj pour nager d en MAX) | sans unité, ∈ ]0, 1] |
| `A_nage(D, d, S)` | Multiplicateur d'ajustement par nage | sans unité, ≈ 1 |
| `Δ_mesure(d)` | Correction contextuelle (départ plongé/poussé, virages, bassin) | secondes |
| `k_allure(famille, zone)` | Coefficient de vitesse | sans unité, ∈ ]0, 1] |
| `tMAX(d)` | Temps MAX attendu sur la répétition | secondes |
| `t_allure(d)` | Temps cible pour l'allure choisie | secondes |

**Note conceptuelle** : `k` est un **coefficient de vitesse**, pas de temps. `k = 0.80` signifie "80% de la vitesse MAX → temps = tMAX / 0.80 (donc plus long)".

### 3.3. Tables de référence (à seeder)

#### 3.3.1. Coefficients k_allure par famille d'épreuve (doc §4)

| Famille | V0 | V1 | V2 | V3 | V4 | MAX |
|---|---|---|---|---|---|---|
| `50m` | 0.70 | 0.78 | 0.86 | 0.94 | 0.98 | 1.00 |
| `100m` | 0.72 | 0.80 | 0.88 | 0.95 | 0.98 | 1.00 |
| `200m` | 0.74 | 0.82 | 0.90 | 0.96 | 0.985 (opt) | 1.00 |
| `400m` | 0.76 | 0.84 | 0.91 | 0.96 | — | 1.00 |
| `800m_1500m` | 0.78 | 0.86 | 0.92 | 0.97 | — | 1.00 |

`V4` est `null` pour `400m` et `800m_1500m` ; le coach peut activer/désactiver V4 sur 200m via un toggle.

#### 3.3.2. Ratios R_base par épreuve et distance (doc §5)

**Épreuve 50m** : `(15, 0.241), (20, 0.346), (25, 0.451), (30, 0.561), (35, 0.671), (40, 0.780), (45, 0.890), (50, 1.000)`

**Épreuve 100m** : `(15, 0.114), (25, 0.214), (35, 0.316), (50, 0.470), (75, 0.735), (100, 1.000)`

**Épreuve 200m** : `(25, 0.115), (50, 0.235), (75, 0.359), (100, 0.485), (150, 0.740), (200, 1.000)`

**Épreuve 400m** : `(50, 0.120), (100, 0.245), (150, 0.370), (200, 0.496), (300, 0.747), (400, 1.000)`

**Épreuve 800m** : `(50, 0.061), (100, 0.124), (200, 0.249), (400, 0.500), (600, 0.751), (800, 1.000)`

**Épreuve 1500m** : `(50, 0.032), (100, 0.066), (200, 0.133), (400, 0.266), (800, 0.534), (1000, 0.668), (1500, 1.000)`

#### 3.3.3. Ajustements par nage `mS` (doc §7)

`A_nage(D, d, S) = 1 + mS(S, famille_D) × (1 - d/D)²`

À `d = D` → `A_nage = 1` (Tobj conservé). Plus `d` est court, plus l'ajustement diverge de 1.

| Nage | mS 50m | mS 100m | mS 200m | mS ≥400m |
|---|---|---|---|---|
| Crawl | 0.00 | 0.00 | 0.00 | 0.00 |
| Papillon | 0.00 | 0.00 | 0.01 | 0.01 |
| Dos | 0.06 | 0.045 | 0.02 | 0.01 |
| Brasse | 0.04 | 0.035 | 0.025 | 0.01 |

**V1 prend la médiane des plages doc**. Le coach peut surcharger ces valeurs (override par `(coach_id, stroke, event_family)`).

### 3.4. Interpolation log-linéaire (doc §6)

Pour les distances `d` non listées dans `R_base` (ex: 65m sur courbe 100m) :

```
R(d) = R₁ × (R₂ / R₁)^((d - d₁) / (d₂ - d₁))
```

avec `d₁ < d < d₂` les ancres encadrantes.

**Garde-fous** :
- Pas d'extrapolation sous le plus petit point d'ancrage (lever exception).
- Pas d'extrapolation au-dessus de `D`.
- Si `d` matche exactement un ancrage, retour direct du ratio (pas d'interpolation).

### 3.5. Épreuves 4 nages (doc §9)

**Approche segmentée** : on ne calcule pas une courbe globale 4N. Pour chaque segment, on extrait le temps du segment via les poids du doc, puis on applique la courbe de la nage du segment sur les distances internes.

#### 3.5.1. 200 4N — poids par segment

| Segment | Distance | Poids `w` |
|---|---|---|
| Papillon | 50m | 0.218 |
| Dos | 50m | 0.250 |
| Brasse | 50m | 0.290 |
| Crawl | 50m | 0.242 |

`T_segment = Tobj_2004N × w_segment` puis `tMAX_segment(d_interne) = T_segment × R_50m_S(d_interne) × A_S(50, d_interne)`.

#### 3.5.2. 400 4N — poids par segment

| Segment | Distance | Poids `w` |
|---|---|---|
| Papillon | 100m | 0.229 |
| Dos | 100m | 0.255 |
| Brasse | 100m | 0.280 |
| Crawl | 100m | 0.236 |

#### 3.5.3. Distances cumulées en 4N

`tMAX_cumule(x) = Σ(segments_terminés) + tMAX_segment_courant(d_interne)`

Ex : 125m d'un 200 4N = 50 papillon (complet) + 50 dos (complet) + 25 brasse (interne).

### 3.6. Cas non couverts par le doc

- **100 4N** : le doc ne le mentionne pas. Décision : accepter la cible, mais désactiver le toggle 25↔50 (pas de FFN) et utiliser une segmentation 25m/nage avec les poids `(0.218, 0.250, 0.290, 0.242)`. À valider en review métier.
- **NAC, Spé** (utilisés ailleurs dans l'app) : hors scope §186. Refusés à la création d'une cible avec un message UX clair "Nage non gérée par le modèle d'allures, utilisez NL/Dos/Brasse/Pap/4N". Pas de fallback linéaire (le modèle v1 est supprimé).

## 4. Distances de répétition affichées (doc §3.3)

Le modèle v2 étend les lignes de matrice par défaut :

| Épreuve cible | Distances affichées |
|---|---|
| 50m | 15, 20, 25, 30, 35, 40, 45, 50 |
| 100m | 15, 25, 35, 50, 65, 75, 100 |
| 200m | 25, 50, 75, 100, 150, 200 |
| 400m | 50, 75, 100, 150, 200, 300, 400 |
| 800m | 50, 100, 200, 300, 400, 600, 800 |
| 1500m | 50, 100, 200, 300, 400, 800, 1000, 1500 |
| 200 4N | par segment 25m + cumulés 100/150/200 |
| 400 4N | par segment 50m + cumulés 200/300/400 |

Le coach peut **ajouter des distances ad-hoc** via un input "+", interpolation log-linéaire automatique. Cette feature est listée comme "preferred" mais peut être différée à §187 si le scope §186 explose.

## 5. Modèle de données

### 5.1. Migration `00151_pace_model_v2.sql`

```sql
-- (a) Refonte coach_pace_zones : passage à un modèle par famille × zone.
-- L'ancienne structure (1 row par coach, 5 colonnes pct) est droppée et recréée
-- avec le shape v2. Aucune donnée à préserver : pas de calibrations utilisateurs en prod.
DROP TABLE IF EXISTS coach_pace_zones CASCADE;

CREATE TABLE coach_pace_zones (
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_family text NOT NULL CHECK (event_family IN ('50m','100m','200m','400m','800m_1500m')),
  zone text NOT NULL CHECK (zone IN ('V0','V1','V2','V3','V4','MAX')),
  k_value numeric(5,4) NOT NULL CHECK (k_value > 0 AND k_value <= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_id, event_family, zone)
);
ALTER TABLE coach_pace_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_pace_zones_select_own"
  ON coach_pace_zones FOR SELECT USING (coach_id = (SELECT auth.uid()));
CREATE POLICY "coach_pace_zones_insert_own"
  ON coach_pace_zones FOR INSERT WITH CHECK (coach_id = (SELECT auth.uid()));
CREATE POLICY "coach_pace_zones_update_own"
  ON coach_pace_zones FOR UPDATE USING (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));
CREATE POLICY "coach_pace_zones_delete_own"
  ON coach_pace_zones FOR DELETE USING (coach_id = (SELECT auth.uid()));

-- (b) Table de ratios de référence (read-only, seedée, partagée)
CREATE TABLE pace_ratios_base (
  event_distance_m int NOT NULL,
  repetition_distance_m int NOT NULL,
  ratio numeric(5,4) NOT NULL CHECK (ratio > 0 AND ratio <= 1),
  PRIMARY KEY (event_distance_m, repetition_distance_m)
);
-- Pas de RLS : table de référence publique en lecture.
GRANT SELECT ON pace_ratios_base TO anon, authenticated;
-- Seed via migration data avec les 6 courbes du doc §3.3.2.

-- (c) Ajustements par nage (read-only globalement, override par coach)
CREATE TABLE pace_stroke_adjustments (
  stroke text NOT NULL CHECK (stroke IN ('crawl','dos','brasse','papillon')),
  event_family text NOT NULL,
  m_value numeric(5,4) NOT NULL,
  PRIMARY KEY (stroke, event_family)
);
GRANT SELECT ON pace_stroke_adjustments TO anon, authenticated;
-- Seed via migration data avec les valeurs §3.3.3.

-- (d) Override coach des mS
CREATE TABLE coach_stroke_adjustments (
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stroke text NOT NULL,
  event_family text NOT NULL,
  m_value numeric(5,4) NOT NULL,
  PRIMARY KEY (coach_id, stroke, event_family)
);
ALTER TABLE coach_stroke_adjustments ENABLE ROW LEVEL SECURITY;
-- Policies miroir.

-- (e) Mapping nages : alias crawl <-> NL pour cohérence avec le reste de l'app
-- Pas de migration de données : l'aliasing est géré côté code (NL → crawl en interne).
-- Pas de feature flag : bascule directe vers le modèle v2.
```

### 5.2. Stockage des cibles (`coach_pace_targets`)

**Pas de changement de schéma.** La table existante stocke `(stroke, target_distance_m, target_time_ms, target_pool_size)` qui suffit. Le modèle v2 enrichit le calcul, pas la cible.

L'extension prévue en §187 pour les tests individuels n'impacte pas §186.

## 6. Refonte API

### 6.1. Module pur `src/lib/paceCalculatorV2.ts`

```ts
export type EventFamily = "50m" | "100m" | "200m" | "400m" | "800m_1500m";
export type StrokeV2 = "crawl" | "dos" | "brasse" | "papillon" | "4N";
export type ZoneV2 = "V0" | "V1" | "V2" | "V3" | "V4" | "MAX";

export interface RatioTable {
  [eventDistance: number]: Array<{ d: number; ratio: number }>;
}

export interface ZoneCoefficients {
  // (family, zone) -> k
  [familyZone: string]: number;
}

export interface StrokeAdjustments {
  // (stroke, family) -> mS
  [strokeFamily: string]: number;
}

/** Famille d'épreuve à partir de la distance cible. */
export function eventFamily(D: number): EventFamily;

/** Mappe NL ↔ crawl pour cohérence interne. */
export function normalizeStroke(s: string): StrokeV2;

/** R_base avec interpolation log-linéaire si d ∉ ancres. */
export function getRatio(D: number, d: number, table: RatioTable): number;

/** A_nage(D, d, S) = 1 + mS × (1 - d/D)². */
export function strokeAdjustment(
  D: number,
  d: number,
  stroke: StrokeV2,
  adj: StrokeAdjustments,
): number;

/** tMAX(d) en secondes (float). */
export function computeTMax(args: {
  Tobj_s: number;
  D: number;
  d: number;
  stroke: StrokeV2;
  delta_mesure_s?: number;
  ratios: RatioTable;
  adjustments: StrokeAdjustments;
}): number;

/** t_allure(d) en secondes. */
export function computeZoneTime(args: {
  tMax_s: number;
  zone: ZoneV2;
  family: EventFamily;
  zoneCoeffs: ZoneCoefficients;
}): number;

/** 4N — segmentation. */
export function compute4NSegment(args: {
  Tobj_4N_s: number;
  is400: boolean;          // true = 400 4N, false = 200 4N
  segmentStroke: StrokeV2; // papillon | dos | brasse | crawl
  d_internal: number;      // 0 < d <= 100 (200 4N) ou <= 200 (400 4N — non, reste 100m max par seg)
  ratios: RatioTable;
  adjustments: StrokeAdjustments;
}): number;

/** Distances de répétition par défaut pour une cible. */
export function getDistanceRowsV2(D: number, S: StrokeV2): number[];

/** Vérifications de cohérence (doc §11). Retourne [] si OK, sinon liste d'erreurs. */
export function validateMatrix(matrix: {
  Tobj_s: number;
  D: number;
  rows: Array<{ d: number; tMax_s: number; zones: Record<ZoneV2, number> }>;
}): string[];
```

### 6.2. Côté Supabase API

- `src/lib/api/pace-zones.ts` : CRUD sur `coach_pace_zones` (réécrit, l'ancienne version est remplacée)
- `src/lib/api/pace-ratios.ts` : SELECT seul sur `pace_ratios_base` (cache Vite via React Query, staleTime infinity)
- `src/lib/api/pace-stroke-adjustments.ts` : SELECT global + read/upsert override par coach (`coach_stroke_adjustments`)
<!-- supprimé : pas de flag de version, bascule directe vers v2 -->
- `src/hooks/useCoachPaceZones.ts` : lit les zones, insère les défauts du doc si absent (idempotent), expose un setter qui upsert + invalide

## 7. UI

### 7.1. Bascule directe v2

Le `CoachPaceCalculatorScreen` rend toujours le modèle v2. Pas de fallback v1, pas de bandeau de migration. Si une cible existante était stockée avec un input compatible v1, elle est rendue avec les courbes v2 sans intervention.

**Note** : le coach perd ses éventuelles personnalisations de zones v1 (defaults 140/130/115/110/105). Acceptable car aucun coach n'a calibré v1 en production hors smoke test interne.

### 7.2. Drawer "Zones"

Avant : 5 sliders globaux.

Après v2 : tabs par famille d'épreuve (`50m | 100m | 200m | 400m | 800m+1500m`), 6 sliders par tab (V0..V4..MAX, V4 désactivé selon doc). Bouton "Réinitialiser aux défauts du doc".

### 7.3. Drawer "Ajustements par nage"

Nouveau panel : grille 4 nages × 5 familles d'épreuve, chaque cellule un input numérique pour mS. Légende rappelant `(1 - d/D)²` et bouton "Réinitialiser aux médianes du doc".

### 7.4. Matrices

Lignes étendues selon §4 ci-dessus. Affichage V4 conditionnel (visible 50m/100m, optionnel 200m via toggle dans le header de la matrice). Cellule MAX visuellement plus marquée (contraste).

Pour les **4N** : le rendu n'est plus une matrice unique mais 4 sous-matrices empilées (une par segment) + un récap "cumulés" en bas. Spec UI à valider en `/frontend-design`.

### 7.5. Disclaimer "modèle v2"

Footer matrice :

> Modèle non-linéaire v2 (basé sur `regles_calcul_allures_natation.docx`). Coefficients à calibrer par tests individuels — voir §187.

## 8. Stratégie de migration

### 8.1. Bascule directe v2

- Migration `00151` droppe la table `coach_pace_zones` v1 et la recrée en v2.
- Pas de feature flag, pas d'opt-in coach.
- Toutes les `coach_pace_targets` existantes sont préservées (leur input ne change pas) et rendues avec les courbes v2 dès la livraison.

### 8.2. Initialisation des zones par coach

Quand un coach ouvre le calculateur d'allures pour la première fois après §186, le hook `useCoachPaceZones` :

1. Tente de lire les zones du coach.
2. Si aucune zone n'existe (cas par défaut post-migration), insère les 25 lignes des défauts du doc en une seule transaction (5 familles × 5 zones obligatoires V0..V3..MAX, V4 n'est créée que si activée).
3. Cache React Query, staleTime infinity.

### 8.3. Pas de retour arrière

Une fois la migration appliquée, le modèle v1 est définitivement perdu. Aucun mécanisme de fallback n'est exposé en UI.

## 9. Tests

### 9.1. Unitaires

- `src/__tests__/paceCalculatorV2.test.ts` :
  - `eventFamily(D)` : tous les cas (50, 100, 200, 400, 800, 1500)
  - `getRatio(D, d, table)` :
    - cas exact (d ∈ ancres)
    - cas interpolé (ex: d=65 dans courbe 100m, vérif log-linéaire)
    - extrapolation hors borne → throws
  - `strokeAdjustment` : `d=D` → 1.0 ; valeurs intermédiaires
  - `computeTMax` : exemples doc §12 reproduits exactement à 0.01s près
    - 50 NL 23.62 : tMAX(15)=5.69, tMAX(25)=10.65, tMAX(50)=23.62
    - 100 NL 51.45 : tMAX(25)=11.01, tMAX(50)=24.18, tMAX(100)=51.45
    - 200 NL 1:53.00 : tMAX(50)=26.55, tMAX(100)=54.80, tMAX(200)=113.00
  - `computeZoneTime` : V0(25, 50m crawl, 23.62) = 15.21..15.22
  - `compute4NSegment` : reproduction de l'exemple doc §9 (25m brasse dans 200 4N)
  - `validateMatrix` : 7 contrôles doc §11

### 9.2. RLS

- `supabase/tests/rls/coach_pace_zones.test.ts` : isolation cross-coach
- `supabase/tests/rls/coach_stroke_adjustments.test.ts` : idem
- `pace_ratios_base` : pas de test RLS (table publique read-only) ; vérification fixture initiale via SQL test

### 9.3. Composants

- `PaceMatrix.test.tsx` : V4 visible 50m/100m, masquée 400m/800m/1500m sauf si activée, cellules conformes aux exemples doc §12
- `CoachPaceCalculatorScreen.test.tsx` : initialisation des zones par défaut au premier rendu, render des matrices v2
- `PaceZonesSettings.test.tsx` : tabs par famille, toggle V4 par famille, validation `V0 < V1 < ... < MAX` (en speed coefficients)

### 9.4. Non-régression

- Tests UI §184/§185 portant sur `PaceMatrix`, `SwimmerPaceCard`, `CoachPaceCalculatorScreen` doivent être réécrits/adaptés (changement de contrat). Les tests "façade" (export PDF, partage, persistance des cibles) doivent rester verts sans modification.
- Pool conversion §185 : intacte. La FFN reste appliquée en post-calcul sur le temps v2.

## 10. Plan de livraison (ordre suggéré)

1. **Migration 00151** + seeds des tables de référence (ratios, adjustments)
2. **Module pur `paceCalculatorV2.ts`** + tests unitaires complets (TDD strict)
3. **API modules** (refonte `pace-zones.ts`, nouveaux `pace-ratios.ts`, `pace-stroke-adjustments.ts`)
4. **Hooks** (`useCoachPaceZones` avec init défauts idempotente, `usePaceRatios`, `useCoachStrokeAdjustments`)
5. **Refonte composants** (`PaceMatrix` v2, `PaceZonesSettings` tabs par famille + V4 togglable, nouveau `PaceStrokeAdjustments`)
6. **Page coach** : remplacement des composants v1 par v2 dans `CoachPaceCalculatorScreen`
7. **4N segmenté** : composant `Pace4NSegmentMatrix.tsx` + intégration
8. **Tests RLS** + tests composants
9. **Doc** : §186 entry dans implementation-log + update CLAUDE.md / files-map

## 11. Risques & mitigations

| Risque | Mitigation |
|---|---|
| Exemples doc §12 non reproduits exactement | Travail TDD : chaque cellule du tableau exemple = un test unitaire. Ajustement des arrondis si écart. |
| Bascule v1→v2 perd ou corrompt des cibles | Pas de modification de `coach_pace_targets`. Seules les zones changent (DROP + recréation). Aucun rollback prévu — accepté car v1 n'a pas de calibration utilisateur en prod. |
| 4N segmenté trop complexe pour V1 | Livrable en sous-phase si besoin (4N = §186b en cas de scope explosion) |
| mS doc en plages, pas en valeurs uniques | Médiane des plages utilisée comme défaut, override coach disponible |
| Performance : 30 rows zones + 6 ratios + 20 adjustments × 100 cibles = beaucoup de calculs front | Memoize les tables côté React Query (staleTime infinity sur ratios + adjustments globaux) |

## 12. Forward references

- **§187 — Calibration individuelle** : tests réels par nageur, hiérarchie de fallback, Δ_mesure (départ plongé/poussé/virages).
- **§188 — Gouvernance** : audit trail des params, versioning des coefficients, disclaimers de péremption des tables.

§186 doit être complet et stable avant de lancer §187 (qui ajoute une couche par-dessus le modèle de base).
