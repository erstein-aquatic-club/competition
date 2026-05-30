# Design — Bilan muscu : mobilité gauche/droite + notes + historique/évolution

> **Date** : 2026-05-30
> **Origine** : retour terrain François (coach) après §345. Deux features liées sur le bilan muscu.
> **Statut** : design validé (brainstorming). Prochaine étape : plan d'implémentation (`writing-plans`).

## Contexte

Le bilan physique muscu (`StrengthAssessmentScreen`, coach) note la mobilité/mouvement par axe sur **0-3**, stockés dans `strength_assessments.physical_tests` (jsonb) :

```
mobility: { shoulder_flexion, t_spine, hip }        // 0-3
movement: { scapula_control, trunk_neck_alignment, hip_hinge }  // 0-3
filled_at
```

Le moteur (`mesocycleEngine.ts`) lit ces nombres : `scoreMobility` (somme → 0-100) et `dysfunctionFlags` (sous-score = 0 → dysfonction → override sécurité « mobilité forcée en focus »).

**Manques signalés par le coach** : (a) pas de **latéralité** — des nageurs ont une bonne rotation thoracique à gauche mais pas à droite, idem scapulaire ; (b) pas de **notes** ; (c) pas d'**historique** des bilans passés ni de suivi d'évolution.

## Décisions (validées)

1. **Axes G/D** : `shoulder_flexion`, `t_spine`, `hip` (mobilité) + `scapula_control`, `hip_hinge` (mouvement) deviennent bilatéraux G/D. `trunk_neck_alignment` (alignement axial central) reste un score unique.
2. **Moteur** : utilise le **côté le plus faible** `min(left, right)` par axe pour le scoring/override sécurité → une asymétrie unilatérale est prise en compte (corriger le point faible). Rétrocompatible (ancien score unique = G=D).
3. **Notes** : une note **par axe** (optionnelle) **+** une note de **synthèse globale**.
4. **Historique** : sur la vue Bilan coach — liste des bilans (date/statut) + consultation **read-only** d'un ancien + **courbe d'évolution** des scores ; bouton « Nouveau bilan ». Coach-only.

## Architecture — modèle de données

**Forme uniforme `{ left, right, note? }` par axe, dans le jsonb existant, SANS migration SQL, avec un normaliseur de lecture.** (Approche retenue ; écartées : forme mixte number/objet = union TS pénible chez chaque consommateur ; table normalisée séparée = migration + RLS pour 6 axes = YAGNI.)

```ts
interface MobilityAxisScore { left: number; right: number; note?: string } // 0-3
interface StrengthPhysicalTestsV2 {
  mobility: { shoulder_flexion: MobilityAxisScore; t_spine: MobilityAxisScore; hip: MobilityAxisScore };
  movement: { scapula_control: MobilityAxisScore; trunk_neck_alignment: MobilityAxisScore; hip_hinge: MobilityAxisScore };
  note?: string;        // synthèse globale
  filled_at: string;
}
```

- `trunk_neck_alignment` porte la même forme avec `left === right` (un seul input écrit les deux) → forme uniforme, consommateurs simples.
- **Normaliseur pur** `normalizePhysicalTests(raw): StrengthPhysicalTestsV2 | null` : upcaste l'ancienne forme (un `number` par axe) → `{ left: n, right: n }`. **Source unique** de la rétrocompat → aucun consommateur ne branche v1/v2.
- **Aucune migration SQL** : jsonb est sans schéma, même table/colonne/RLS → pas de `test:rls`. Les écritures (`updateAssessmentPhysicalTests`) posent la forme v2 ; les lectures passent par le normaliseur.

## Moteur

- `scoreMobility` et `dysfunctionFlags` consomment le **score effectif** d'un axe = `min(left, right)`, via le normaliseur. Helper `effectiveAxisScore(axis) = Math.min(axis.left, axis.right)`.
- Comportement inchangé pour les anciens bilans (G=D → min = ancienne valeur). TDD : axe asymétrique (G=3, D=0) → dysfonction détectée ; ancien bilan (number) → identique.

## UI

**Slice A — saisie bilan (7)** (`StrengthAssessmentScreen` / `AssessmentScoreField`, via `/frontend-design`) :
- Pour les 5 axes G/D : deux sélecteurs 0-3 côte à côte **Gauche | Droite** + un champ note repliable (optionnel).
- `trunk_neck_alignment` : sélecteur unique (écrit left=right).
- Note de synthèse globale en bas du formulaire.
- `updateAssessmentPhysicalTests` écrit la forme v2.

**Slice B — historique + évolution (6)** (coach) :
- Section « Historique » : `listAssessments(athleteId)` → liste (date, statut) ; tap → détail **read-only** du bilan ; bouton « Nouveau bilan ».
- **Courbe d'évolution** (recharts, déjà en dépendance) : score effectif par axe (mobilité/mouvement) dans le temps, option **G vs D** ; KPIs réutilisent `getKpiHistory`.

## Tests

- `normalizePhysicalTests` (node:test) : old number → {left,right} ; v2 passthrough ; champ manquant → défaut sûr.
- `effectiveAxisScore` / `scoreMobility` / `dysfunctionFlags` G/D (node:test) : asymétrie G≠D, rétrocompat ancien bilan.
- vitest UI : saisie G/D + note (Slice A) ; liste historique + sélection détail (Slice B).

## Ordre de livraison

1. **Slice A** (data model + normaliseur + moteur min + saisie G/D + notes). Ne casse rien (normaliseur), aucune migration. § dédié.
2. **Slice B** (historique read-only + courbe d'évolution). Additif. § suivant.

## Hors scope / futur

- **(8) [FUTUR]** Routines d'échauffement pilotées par les déficits de mobilité G/D (séance = articulaire commun → mobilité nageur → échauffement musculaire spécifique → séance principale). Dépend des données G/D de ce chantier. Voir mémoire `muscu-bilan-warmup-roadmap`.
- Saisie de la mobilité côté nageur (reste coach-only).
