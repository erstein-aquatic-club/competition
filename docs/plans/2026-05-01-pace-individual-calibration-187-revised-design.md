# §187 — Affinement individuel des courbes d'allures (révisé)

*Design validé le 2026-05-01. Remplace `archived/2026-05-01-pace-individual-calibration-187-ABANDONED.md` (calibration par tests réels jugée overkill). Précondition : §186 stable.*

## 1. Contexte

Le modèle v2 livré en §186 utilise des courbes universelles (`R_base`, `A_nage`, `k_allure`). En production, certains nageurs auront un comportement systématiquement plus dur ou plus facile que la courbe — sprinteurs, brasseurs, nageurs au départ atypique.

§187 révisé permet au coach de **corriger globalement** les allures d'un nageur via un seul multiplicateur, sans capture de tests, sans interpolation, sans hiérarchie. Si le nageur progresse, le coach ajuste à nouveau le slider.

**Volontairement hors scope (vs design abandonné) :** tests réels (`swimmer_pace_tests`), interpolation `M(d)`, drawer "saisie rapide bord-de-bassin", `Δ_mesure` (départ + bassin), corrections de contexte coach-level.

## 2. Décisions de conception

| # | Décision | Justification |
|---|---|---|
| C1 | Un seul multiplicateur global par nageur, slider `[0.90, 1.10]`, défaut 1.000 | Granularité suffisante pour V1. Si besoin granulaire émerge, V2 ajoutera des overrides par cible. |
| C2 | Pas de row DB quand `multiplier = 1.000` | Économie : 90% des nageurs gardent le défaut. La table reste petite (= nb de nageurs réellement affinés). |
| C3 | Application en sortie du moteur : `t_final = t_calculé / multiplier` | Multiplier > 1 → temps **plus rapides** (nageur plus fort que la courbe), < 1 → temps plus lents. Aligne le sens "le nageur va plus vite que prévu = j'augmente". |
| C4 | Visible dans toutes les vues (matrice écran, PDF, page partagée) avec un badge subtil "Affiné ×1.025" | Transparence : le nageur sait que ses allures sont calibrées pour lui. |
| C5 | Drawer accessible depuis `SwimmerPaceCard` uniquement (pas depuis l'éditeur de cible) | Le multiplicateur est nageur-scoped, pas cible-scoped. |

## 3. Schéma DB

### 3.1. Migration `00154_swimmer_pace_calibration.sql`

```sql
CREATE TABLE coach_swimmer_pace_calibration (
  coach_id            uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  swimmer_account_id  bigint  REFERENCES users(id) ON DELETE CASCADE,
  swimmer_manual_id   uuid    REFERENCES coach_manual_swimmers(id) ON DELETE CASCADE,
  multiplier          numeric(4,3) NOT NULL CHECK (multiplier BETWEEN 0.900 AND 1.100),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK ((swimmer_account_id IS NULL) <> (swimmer_manual_id IS NULL)),
  PRIMARY KEY (coach_id, swimmer_account_id, swimmer_manual_id)  -- nécessite NULL-distinct PK ou UNIQUE INDEX partiels
);

-- Index partiels pour PK NULL-distinct
CREATE UNIQUE INDEX idx_calibration_account
  ON coach_swimmer_pace_calibration (coach_id, swimmer_account_id)
  WHERE swimmer_account_id IS NOT NULL;
CREATE UNIQUE INDEX idx_calibration_manual
  ON coach_swimmer_pace_calibration (coach_id, swimmer_manual_id)
  WHERE swimmer_manual_id IS NOT NULL;

ALTER TABLE coach_swimmer_pace_calibration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calibration_select_own_or_swimmer"
  ON coach_swimmer_pace_calibration FOR SELECT
  USING (
    coach_id = auth.uid()
    OR swimmer_account_id = app_user_id()  -- le nageur peut lire sa propre calibration
  );

CREATE POLICY "calibration_write_coach_own"
  ON coach_swimmer_pace_calibration FOR ALL
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());
```

**Note PK :** Postgres traite NULL comme distinct dans les UNIQUE PK. La PK `(coach_id, swimmer_account_id, swimmer_manual_id)` autorise donc `(c1, NULL, m1)` et `(c1, NULL, m1)` simultanément. D'où les **2 index partiels** comme garde-fou réel d'unicité.

### 3.2. Pas de modification de `get_pace_share_payload`

Le multiplier est inclus séparément (cf. §4.2). Pas de schema breaking.

## 4. API

### 4.1. Module `src/lib/api/pace-calibration.ts`

```ts
export interface PaceCalibration {
  coach_id: string;
  swimmer_account_id: number | null;
  swimmer_manual_id: string | null;
  multiplier: number;  // 0.900 .. 1.100
  updated_at: string;
}

export async function getCalibration(
  swimmer: { account_id: number } | { manual_id: string }
): Promise<PaceCalibration | null>;

export async function upsertCalibration(args: {
  swimmer_account_id?: number;
  swimmer_manual_id?: string;
  multiplier: number;
}): Promise<PaceCalibration>;

export async function deleteCalibration(args: {
  swimmer_account_id?: number;
  swimmer_manual_id?: string;
}): Promise<void>;
```

`upsertCalibration` avec `multiplier === 1.000` doit appeler `deleteCalibration` (économie row).

### 4.2. Hook `useSwimmerCalibration(swimmer)`

```ts
export function useSwimmerCalibration(
  swimmer: { account_id: number } | { manual_id: string } | null
): { multiplier: number; isLoading: boolean; mutate: (m: number) => Promise<void> };
```

Défaut 1.000 si null/manquant.

### 4.3. Extension `paceCalculatorV2.ts`

Une seule fonction publique modifiée : `computePaceMatrix(...)` accepte un `multiplier?: number` optionnel (défaut 1.0). En sortie, chaque cellule est divisée par `multiplier`.

```ts
export function computePaceMatrix(args: {
  // ... existant
  multiplier?: number;  // NEW, default 1.0
}): PaceMatrix {
  // ... calcul standard
  if (multiplier && multiplier !== 1.0) {
    return cells.map(c => ({ ...c, time_ms: Math.round(c.time_ms / multiplier) }));
  }
  return cells;
}
```

## 5. UI

### 5.1. Drawer "Affinement [Nageur]"

Accessible depuis `SwimmerPaceCard` via un bouton header `[Sliders]` (icône `Sliders` lucide). Drawer Radix Sheet à droite.

```
┌──────────────────────────────┐
│ Affinement de Léo Martin   ✕ │
├──────────────────────────────┤
│                              │
│ Multiplicateur : 1.025       │
│ ●──────●─────────────────    │
│ 0.90              1.00  1.10 │
│                              │
│ Léo va 2.5% plus vite        │
│ que la courbe théorique.     │
│                              │
│ [Réinitialiser à 1.00]       │
└──────────────────────────────┘
```

- Slider Radix avec step 0.005 (granularité 0.5%)
- Helper text dynamique en français lisible :
  - `multiplier > 1` → "Le nageur va X% plus vite que la courbe"
  - `multiplier < 1` → "Le nageur va X% moins vite que la courbe"
  - `multiplier = 1` → "Aucun affinement (courbe théorique)"
- Bouton "Réinitialiser à 1.00" → DELETE row + multiplier=1.0 client
- Mutation optimiste (slider responsive en local, persist debounce 500ms)

### 5.2. Badge sur la matrice

Header de chaque matrice (à côté du toggle 25m/50m) : si `multiplier !== 1.000`, badge `[Affiné ×1.025]` cliquable qui ouvre le drawer §5.1.

### 5.3. PDF + page partagée

Footer : ajouter une ligne discrète sous le `FFN_DISCLAIMER` :
> Allures affinées individuellement (×1.025) — calibrage par le coach.

Si `multiplier === 1.000`, pas de mention.

## 6. Tests

### 6.1. Unitaires (`paceCalculatorV2`)

- `multiplier = 1.0` → matrice identique au calcul §186
- `multiplier = 1.05` → toutes les cellules sont 5% plus rapides (à 1ms près d'arrondi)
- `multiplier = 0.95` → 5% plus lentes
- Bornes : `multiplier = 0.90` et `1.10` ne doivent pas dépasser les bornes DB

### 6.2. RLS (`coach_swimmer_pace_calibration`)

- Coach A peut écrire pour ses nageurs (account + manual)
- Coach B ne voit pas la calibration de coach A
- Le nageur peut SELECT sa propre calibration (pour la lecture client)
- Le nageur ne peut pas écrire

### 6.3. Composants

- `SwimmerPaceCalibrationDrawer.test.tsx` : slider, debounce, reset, helper text dynamique, mutation optimiste
- `PaceMatrix.test.tsx` : badge "Affiné" visible si multiplier ≠ 1, opens drawer on click

### 6.4. Intégration end-to-end

Pour un nageur configuré avec `multiplier = 1.025`, vérifier que :
- la matrice écran applique le multiplier
- le PDF généré applique le multiplier
- la page partagée publique applique le multiplier (le payload share doit inclure le multiplier)

## 7. Plan de livraison

1. Migration `00154` + RLS tests
2. API module + hook
3. Extension `paceCalculatorV2` + tests unitaires
4. Drawer affinement + badge matrice
5. PDF + page partagée (propagation du multiplier)
6. Doc

## 8. Risques

| Risque | Mitigation |
|---|---|
| Coach règle le slider à l'extrême (1.10 ou 0.90) → matrice irréaliste | Bornes DB strictes. Helper text rappelle "10% est déjà beaucoup". |
| Nageur changeant de coach garde une calibration de l'ancien coach | Calibration scoped `(coach_id, swimmer_id)`. Le nouveau coach démarre à 1.0 par défaut. |
| Multiplier "oublié" → coach pense que les allures sont théoriques alors qu'elles sont calibrées | Badge `[Affiné]` sur toutes les vues + footer PDF. Aucune surprise. |

## 9. Hors scope (non-buts assumés)

- Tests chrono réels capturés en DB → abandonné (cf. plan archivé)
- Interpolation entre tests → abandonné
- Hiérarchie de fallback (test direct > interpolé > groupe > théorique) → abandonné, on a juste théorique × multiplier
- Override par cible (granularité fine) → V2 si besoin émerge
- Audit trail des changements de multiplier → cf. §188 abandonné, pas de besoin

## 10. Forward references

- **§188 (réutilisé)** : Lier objectifs nageur ↔ allures. Pas de dépendance directe avec ce §187 révisé — les deux s'empilent sans contrainte.
