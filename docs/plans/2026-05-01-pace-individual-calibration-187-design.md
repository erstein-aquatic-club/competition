# §187 — Calibration individuelle des allures

*Design validé le 2026-05-01. Source métier : `regles_calcul_allures_natation.docx` §10. Précondition : §186 livré et stable.*

## 1. Contexte

Le modèle v2 livré en §186 utilise des courbes de référence universelles. Le doc §10 explique que ces courbes ne sont qu'un point de départ : un sprinteur, un brasseur, un nageur au départ atypique nécessitent une **calibration individuelle** par tests réels.

§187 ajoute cette couche : capturer les tests d'un nageur, dériver des correctifs personnalisés à appliquer sur la courbe de base, et matérialiser une hiérarchie de données pour le calcul (test réel > correction contexte > profil groupe > théorique).

## 2. Décisions de conception

| # | Décision | Justification |
|---|---|---|
| C1 | Tests stockés par `(swimmer_ref × event_distance × test_distance × context)` avec horodatage | Permet plusieurs tests sur la même paire d'épreuve, choix du plus récent ou moyenne par UI |
| C2 | Multiplicateur `M_test = R_test / R_base`, interpolé entre tests, borné `[0.95, 1.05]` (override possible) | Conformité doc §10.2 |
| C3 | `Δ_mesure` séparé en deux dimensions : (a) départ : plongé / poussé ; (b) bassin de mesure : 25m / 50m | Conformité doc §8 |
| C4 | Hiérarchie de fallback codée en dur dans `paceCalculatorV2` (extension de §186) | Pas de table de "préférences de fallback" — comportement déterministe |
| C5 | UI : nouvel onglet "Tests" dans `SwimmerPaceCard` + accès rapide via raccourci bord-de-bassin | Le coach doit pouvoir saisir un chrono test en 3 taps |

## 3. Modèle calculatoire augmenté

### 3.1. Nouvelle hiérarchie pour `R(D, d, S, swimmer)`

```
1. Si test réel pour (swimmer, D, d) dans le bon contexte :
     R = t_test / Tobj
2. Sinon, si test réel pour (swimmer, D, d') avec d' ≠ d :
     R = R_base(D, d) × M(d) où M est interpolé via les tests disponibles
3. Sinon, si profil de groupe pour (group_id, S, D, d) :
     R = profil_groupe(...)  ← optionnel, hors V1
4. Sinon : R = R_base(D, d) × A_nage(D, d, S)  (modèle §186 standard)
```

### 3.2. Multiplicateur de calibration

`M_test(d_test) = R_test(d_test) / R_base(D, d_test)`

Pour propager autour du test (un seul test disponible) :

```
M(d) = 1 + (M_test - 1) × max(0, (1 - d/D) / (1 - d_test/D))    pour d ≤ d_test
M(d) = 1 + (M_test - 1) × max(0, (d/D) / (d_test/D))            pour d > d_test (doc §10.2)
```

Borné par défaut à `[0.95, 1.05]`. Le coach peut désactiver le bornage par cible (cas extrême : sprinteur très atypique).

### 3.3. `Δ_mesure(d, context)`

```
Δ_mesure(d, context) = Δ_start(d, mode_start) + Δ_pool(d, training_pool, target_pool)
```

- `Δ_start(d, plongé→poussé)` : seconde additive (doc §8.1). Mesurée par le coach par tests A/B.
- `Δ_pool(d, training_pool, target_pool)` : applicable seulement si `target_pool ≠ training_pool`. Modélisée par `nb_virages × Δ_virage(d)` (doc §8.3). Valeurs par défaut estimées (`Δ_virage = 0.5s` pour les distances >25m, sinon 0).

**Séparation stricte** avec la conversion FFN §185 : la conversion FFN reste un outil de **lecture** (transposer un temps déjà calculé), pas un input du calcul. Le `Δ_mesure` est un input qui modifie `tMAX`.

## 4. Modèle de données

### 4.1. Migration `00152_pace_individual_calibration.sql`

```sql
-- (a) Tests réels d'un nageur
CREATE TABLE swimmer_pace_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  swimmer_account_id bigint REFERENCES users(id) ON DELETE CASCADE,
  swimmer_manual_id uuid REFERENCES coach_manual_swimmers(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES coach_pace_targets(id) ON DELETE CASCADE,
  test_distance_m int NOT NULL CHECK (test_distance_m > 0),
  test_time_ms int NOT NULL CHECK (test_time_ms > 0),
  context_start text NOT NULL CHECK (context_start IN ('dive','push','signal','manual')),
  context_pool_size text NOT NULL CHECK (context_pool_size IN ('25m','50m')),
  notes text,
  tested_at date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((swimmer_account_id IS NULL) <> (swimmer_manual_id IS NULL))
);
CREATE INDEX idx_pace_tests_target ON swimmer_pace_tests (target_id);
CREATE INDEX idx_pace_tests_coach_swimmer ON swimmer_pace_tests (coach_id, swimmer_account_id, swimmer_manual_id);
ALTER TABLE swimmer_pace_tests ENABLE ROW LEVEL SECURITY;
-- Policies miroir des autres tables coach_*

-- (b) Corrections de contexte par coach (Δ_start et Δ_pool)
CREATE TABLE coach_pace_corrections (
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  correction_kind text NOT NULL CHECK (correction_kind IN ('dive_to_push','pool_25_to_50')),
  repetition_distance_m int NOT NULL,
  delta_seconds numeric(5,3) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_id, correction_kind, repetition_distance_m)
);
ALTER TABLE coach_pace_corrections ENABLE ROW LEVEL SECURITY;
-- Policies miroir.
```

### 4.2. Aucun changement sur `coach_pace_targets`

Le contexte du target reste `target_pool_size` (référence pour la projection), les tests stockent leur propre contexte indépendamment.

## 5. UI

### 5.1. Onglet "Tests" dans `SwimmerPaceCard`

À côté de l'éditeur de cible et de la matrice, un nouvel onglet `[Tests (N)]` :

- Liste des tests existants : `25m crawl en 11.20 (départ poussé, bassin 25m, 2026-04-12)`
- Bouton `[+ Saisir test]` → form rapide :
  - Distance test (présélection des distances cohérentes selon la cible)
  - Temps (parsePaceTime)
  - Contexte départ : Plongé / Poussé / Signal / Manuel (radios)
  - Contexte bassin : 25m / 50m (radios)
  - Notes (optionnel)
- Suppression d'un test = `AlertDialog` confirm

Quand au moins 1 test existe, la matrice ajoute :
- Un badge `[Calibré sur N tests]` dans le header
- Un trait coloré sur la ligne de la distance testée
- Tooltip sur les autres cellules : "valeur dérivée par interpolation depuis le test 25m"

### 5.2. Saisie rapide bord de bassin

Action depuis `SwimmerPaceCard` ou depuis `Coach Home` : `[+ Test rapide]` (FAB ou item header) → flux ultra-court :

1. Choisir nageur (autocomplete)
2. Choisir épreuve cible existante (si plusieurs cibles, choix ; sinon présélectionnée)
3. Distance + temps + contexte
4. Save → toast + retour matrice avec calibration appliquée

Objectif : 4 taps à l'écran, utilisable bord de bassin.

### 5.3. Drawer "Corrections contexte"

Nouveau drawer accessible depuis le header coach :

- Section `Δ départ plongé→poussé` : 1 input par distance (15, 25, 50, 100, 200) + bouton "Reset défauts"
- Section `Δ virage 25→50m` : idem
- Aide contextuelle expliquant comment mesurer (5-10 essais, médiane)

### 5.4. Hiérarchie d'affichage

Sur chaque cellule de matrice, badge subtil indiquant la source :

- 🎯 (cellule = test direct du nageur)
- ✏️ (cellule = interpolée depuis un test)
- 📊 (cellule = profil de groupe — V2)
- (rien) (cellule = théorique pure §186)

## 6. Refonte API & calculs

### 6.1. Module pur `paceCalculatorV2.ts` étendu

Ajouts (pas de breaking) :

```ts
export interface SwimmerTest {
  test_distance_m: number;
  test_time_ms: number;
  context_start: "dive" | "push" | "signal" | "manual";
  context_pool_size: "25m" | "50m";
  tested_at: string;
}

export interface CalibrationContext {
  Tobj_s: number;
  D: number;
  stroke: StrokeV2;
  tests: SwimmerTest[];
  corrections?: Record<string, number>; // (correction_kind:distance) → delta_s
  bound?: [number, number];             // default [0.95, 1.05]
}

/** R calibré pour une distance donnée, hiérarchie §3.1. */
export function getCalibratedRatio(args: {
  d: number;
  family: EventFamily;
  ratios: RatioTable;
  adjustments: StrokeAdjustments;
  ctx: CalibrationContext;
}): { value: number; source: "test" | "interpolated" | "theoretical" };

/** Δ_mesure pour un cas concret. */
export function deltaForContext(
  d: number,
  testCtx: { start: string; pool: string },
  targetCtx: { start: string; pool: string },
  corrections: Record<string, number>,
): number;
```

### 6.2. API Supabase

- `src/lib/api/swimmer-pace-tests.ts` : list/create/delete
- `src/lib/api/coach-pace-corrections.ts` : list/upsert (par paire kind + distance)

## 7. Tests

### 7.1. Unitaires

- Multiplicateur `M_test` : reproduction des exemples doc §10.2 (formule pour d proche de d_test)
- Bornage `[0.95, 1.05]` : test de saturation
- Hiérarchie : 4 cas (test direct / interpolé / groupe — N/A V1 / théorique)
- `Δ_mesure` : combinaisons de contextes

### 7.2. RLS

- `swimmer_pace_tests.test.ts` : isolation cross-coach
- `coach_pace_corrections.test.ts` : idem

### 7.3. Composants

- `SwimmerPaceTests.test.tsx` : ajout/suppression test, badge calibration
- `QuickTestEntryDrawer.test.tsx` : flux 4 taps, validation

## 8. Plan de livraison

1. Migration 00152 + RLS tests
2. API modules + tests
3. Extension `paceCalculatorV2` (ratio calibré + Δ_mesure)
4. UI : onglet Tests + saisie rapide
5. UI : drawer corrections contexte
6. Doc

## 9. Risques

| Risque | Mitigation |
|---|---|
| Saisie test trop frottante en bord de bassin → adoption faible | Flux 4 taps validé en `/frontend-design` ; FAB persistant ; defaults intelligents (pré-sélection cible la plus récente) |
| Tests vieillissent et faussent la calibration | Disclaimer "Tests > 90 jours" sur les badges ; warning UI si on n'a que des tests anciens |
| Interpolation entre 2 tests donne des valeurs absurdes | Bornage `[0.95, 1.05]` activé par défaut, ne désactivable que par décision explicite (option "avancée") |
| Conflit entre `target_pool_size` et `context_pool_size` du test | UI clarifie : la cible et le test peuvent être en bassins différents, le calcul applique les corrections |

## 10. Forward references

- **§188 — Gouvernance** : audit trail sur tous les paramètres ajoutés ici (corrections, tests modifiés)
