# Design — Ajustement du mésocycle en cours (recalcul mid-cycle)

*Brainstorming 2026-05-28 — François (coach Ines, 50 m crawl, 6 sem)*

## Contexte

Aujourd'hui, après la génération initiale d'un mésocycle, le coach n'a que deux leviers :
1. **Édition par séance** via `StrengthCatalog` + deeplink depuis la planif coach (existe). Coûteux quand il faut propager à plusieurs séances.
2. **Régénération complète** via le wizard `MesocycleGeneration` (réinitialise tout).

Manque : un **3ᵉ levier** « ajuster les semaines restantes » quand un nageur fait un retour terrain mid-cycle. Cas réel : Ines, S1, ne passe pas une traction BW → swap S1+S2 vers Tractions élastiques + OFF J-1 compet. Aujourd'hui ce sont des `UPDATE` DB manuels.

## Synthèse des décisions coach (brainstorming)

| # | Décision | Réponse coach |
|---|---|---|
| 1 | Triggers à couvrir | Charge globale (vol + int séparés), séances/sem, re-prioriser focus (= refaire/màj bilan). **Pas** « exo infaisable » (édition séance par séance existe déjà). |
| 2 | Point de départ du recalcul | Picker à chaque recalcul (default = lundi prochain). |
| 3 | UI | Un seul écran « Ajuster le méso » avec les 3 leviers. |
| 4 | Revert | 1 niveau d'undo (snapshot avant chaque apply, comme §308). |
| 5 | Charge | 2 curseurs séparés volume + intensité. |

## Approche retenue : B — Re-roll engine partiel

3 alternatives évaluées :
- **A** Hot patch sans engine : trop limité (ne couvre pas focus, ne re-distribue pas bien si on retire un jour).
- **B** Re-roll engine partiel (retenue) : appelle `generateMesocycle()` avec target_week_count tronqué + `startPhase` (nouveau) + nouvel input éventuel ; post-process facteurs vol/int ; apply via la RPC existante (table rase §328 + snapshot §308).
- **C** Hybride : 2 paths de code à maintenir, divergence potentielle entre patch direct et engine renormalisation.

**Raisons B :**
1. Multi-leviers natifs (charge + sessions + focus tous gérés par un seul code path).
2. Snapshot/revert §308 préservé → 1 undo « gratuit ».
3. Réutilise `MesocyclePreview` (aperçu jour-aware §307).
4. Complexité concentrée dans l'engine (fonctions pures, testables unitairement).

## Architecture

### Composants

```
CoachSwimmerFullView
   │  ("Ajuster le méso" button, gated on active méso)
   ▼
MesocycleAdjust  [NEW]  src/pages/MesocycleAdjust.tsx
   │  - charge méso actif + assessment courant
   │  - état local : { pivotDate, sessionsPerWeek, weekdays, volumeFactor, intensityFactor }
   │  - dérive startPhase via phaseAtWeek(template, weekIndexOfPivot)
   ▼
generateMesocycle(input + startPhase)  [moteur étendu]
   ▼
applyAdjustmentFactors(plan, vol, int)  [NEW pure helper]
   ▼
MesocyclePreview  [réutilisé, mode "adjust"]
   │  - diff visuel ⇄/⊖/⊕
   │  - bouton "Appliquer"
   ▼
applyMesocycle(input, plan, pivotDate)  [RPC existante, snapshot+table rase]
   ▼
CoachSwimmerFullView  (post-apply nav, déjà géré §326)
```

### Route et accès

- Route : `/strength/mesocycle-adjust/:athleteId` (mode coach uniquement).
- Bouton d'entrée : sur `CoachSwimmerFullView`, exposé seulement si un méso `active` existe pour ce nageur.

### Bouton revert

`CoachSwimmerFullView` a déjà `revertMesocycle` (§308). Comme `apply_strength_mesocycle` prend un snapshot AVANT chaque exécution, un ajustement crée son propre snapshot → le bouton revert ramène à l'état pré-ajustement courant. **0 nouveau code** côté revert.

## UI (mock)

```
┌───────────────────────────────────────────────────────────┐
│ ← Ajuster le mésocycle              [Annuler] [Aperçu →] │
├───────────────────────────────────────────────────────────┤
│ INES — 50 m crawl · S2 / 6 · phase Puissance              │
│                                                            │
│ 📅 Pivot : [lundi 8 juin ▾] (par défaut : prochaine sem.) │
│   ↳ Garde S1, S2 telles quelles. Re-roule S3 → S6.       │
│                                                            │
│ ⚙️ Séances/sem : ◯2 ◯3 ◉4 ◯5                              │
│   Jours : ☑Lun ☑Mar ☐Mer ☑Jeu ☑Ven ☐Sam ☐Dim             │
│                                                            │
│ 💪 Charge (semaines restantes)                            │
│   Volume      [---●------] −20%   (sets ×0.8)             │
│   Intensité   [-----●----]  0%    (pct_1rm ×1.0)          │
│   Préset : [Allègement] [Standard] [Surcharge]            │
│                                                            │
│ 📋 Bilan                                                   │
│   Courant : 28 mai 2026 (data_confidence=full)            │
│   [ Refaire le bilan → ]                                  │
│                                                            │
│ ⚠️ Bannière si pivotDate dans le passé (table rase)       │
└───────────────────────────────────────────────────────────┘
```

**Présets** (modifient les 2 sliders) :
- Allègement : vol=0.8, int=0.9 (proche d'un deload)
- Standard : vol=1.0, int=1.0 (juste sessions ou focus)
- Surcharge : vol=1.15, int=1.05 (rare)

**Refaire le bilan** : navigue vers `KpiWizard`/`StrengthAssessment` avec `?returnTo=...&pivotDate=...` + `sessionStorage.eac_meso_adjust_pending` pour préserver l'état des sliders.

## Extension moteur

### 3.1 Nouveau paramètre `startPhase`

```ts
// src/lib/strength/mesocycleEngine.types.ts
export interface MesocycleInput {
  // ... existant
  startPhase?: PhaseKey | null;
}
```

`periodize()` tronque les phases en amont :
```ts
const phases = startPhase
  ? template.phases.slice(template.phases.findIndex(p => p.cycle === startPhase))
  : template.phases;
```

Si la phase n'existe plus dans le template → fallback phase 1 + signal.

### 3.2 Nouveau helper `applyAdjustmentFactors`

```ts
// src/lib/strength/adjustmentFactors.ts (nouveau)
export function applyAdjustmentFactors(
  plan: GeneratedMesocycle,
  volumeFactor: number,    // 0.5 → 1.5
  intensityFactor: number, // 0.5 → 1.5
): GeneratedMesocycle
```

- Multiplie `sets` (clamp ≥ 1) et `pct_1rm` (clamp [0, 100]) sur tous les items.
- **Garde `pct_1rm = 0` intact** (items BW / plio jamais touchés par intensityFactor).
- Pure fonction.

### 3.3 Helper `phaseAtWeek`

```ts
// src/lib/strength/phaseAtWeek.ts (nouveau)
export function phaseAtWeek(template: Template, weekIndex0: number): PhaseKey | null
```

Étant donné un template et un index de semaine (0-based), retourne la phase. Pure.

### 3.4 Pas de RPC nouvelle

`apply_strength_mesocycle` réutilisée telle quelle (§307 start_date, §308 snapshot, §328 table rase). Traçabilité enrichie : `bucket_priorities.adjustment = { of: <prev_id>, pivot, vol, int }`.

## Error handling

| Cas | Réaction |
|---|---|
| Pivot < lundi semaine en cours | Bannière rouge + Aperçu désactivé |
| Pivot = lundi semaine en cours | Bannière ambre "Tu vas écraser les jours déjà entraînés" |
| Pivot ≥ fin du méso | "Il ne reste aucune semaine à recalculer" + Aperçu désactivé |
| `weeksRemaining` < min phases restantes | `periodize` throw → `EngineErrorScreen` réutilisé |
| Bilan refait interrompu | `sessionStorage.eac_meso_adjust_pending` préserve l'état des sliders ; back ramène sur Ajuster avec ancien assessment |
| Race condition apply | Couvert par §312 `applyLikelySucceededDespiteError` |
| Template supprimé entretemps | "Template introuvable, contacte l'admin" |

## Stratégie de tests

### Tests unitaires moteur (TDD RED→GREEN)
- `periodize(startPhase=...)` valide → tronque
- `periodize(startPhase=inexistant)` → fallback phase 1 + signal
- `periodize(weeks < min restant)` → throw explicite
- `applyAdjustmentFactors` vol=0.8 → sets clamp ≥1
- `applyAdjustmentFactors` int=0.85 → pct_1rm clamp [0, 100]
- `applyAdjustmentFactors` sur item pct=0 (plio) → pct reste 0
- `phaseAtWeek(template, 0)` → phase 1
- `phaseAtWeek(template T8, 4)` → `pic`

### Test d'intégration moteur → factors
`generateMesocycle(startPhase) → applyAdjustmentFactors → snapshot` — vérifier plan tronqué + facteurs appliqués partout + séquence cohérente.

### Tests RLS
Aucun nouveau requis — `apply_strength_mesocycle` a déjà ses 17/17.

### Tests vitest UI
- Pivot default = lundi prochain
- Bannière rouge / ambre selon pivot
- Aperçu désactivé si `weeksRemaining < 1`
- Préset Allègement set vol=0.8, int=0.9
- Refaire bilan save `sessionStorage` AVANT navigation

### Test E2E manuel (Ines)
1. Ajuste depuis S3 (lundi 8 juin) : 4→3 sessions ([Lun,Mer,Ven]) + vol −15%
2. Aperçu : 3 sem tronquées, phases puissance→affutage→pic préservées
3. Apply → planif coach mise à jour
4. Annuler dernier ajustement → restore 4 sessions

## Estimation effort

- Engine extension : ~150 LOC + ~250 LOC tests
- `MesocycleAdjust.tsx` : ~400-500 LOC
- `phaseAtWeek.ts` : ~30 LOC + tests
- `adjustmentFactors.ts` : ~50 LOC + tests

Total : **~600 LOC code + ~400 LOC tests**.

## Découpage en §

Probablement **un seul §** si l'engine extension est petite (startPhase = 1 ligne dans `periodize`, factors = pure helper). Alternative en 2 slices si on veut isoler le risque moteur :
- **Slice A (§335)** : engine étendu (`startPhase`, `applyAdjustmentFactors`, `phaseAtWeek`) + tests unitaires + intégration.
- **Slice B (§336)** : UI `MesocycleAdjust` + branchement bouton coach + tests vitest.

À trancher au moment du plan d'implémentation.

## Hors scope (volontaire)

- Multi-niveaux d'undo (1 seul niveau retenu).
- Ajustement séance-par-séance (existe déjà via `StrengthCatalog`).
- Substitution d'exo en masse (cas du swap Tractions Ines aujourd'hui — séparé du recalcul charge/sessions/focus, à adresser dans un § séparé si besoin terrain confirmé).
- Multi-coachs concurrent edits (l'unicité du méso `active` + race-safe §312 suffisent).

## Référence

- §307 — picker date de départ
- §308 — snapshot + revert + clean-replace RPC
- §312 — garde double-apply
- §326 — post-apply nav fix
- §328 — table rase à la régénération
- `docs/plans/bilan-muscu-templates-sources.md` T8 (`sprint_50/inter_competition`)
- Code source moteur : `src/lib/strength/mesocycleEngine.ts` (~1500 LOC, 6 fonctions pures)
