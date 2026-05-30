# Design — Éditer un ancien bilan (scores physiques) en tant que coach

> **Date** : 2026-05-30
> **Origine** : retour terrain François, après §347 (historique des bilans). L'historique affiche les anciens bilans en read-only ; le coach veut pouvoir **éditer** un ancien bilan.
> **Statut** : design validé (brainstorming). Suite : plan (`writing-plans`).

## Contexte

`StrengthAssessmentScreen` (coach) cible aujourd'hui le **dernier** bilan (`getLatestAssessment`). Le formulaire de notation physique (champs `AssessmentBilateralField` G/D + note de synthèse, §346) n'apparaît qu'en statut `bilan_pending` ; la soumission fait `updateAssessmentPhysicalTests(assessment.id, …)` (id du dernier, codé en dur, ligne ~348). `BilanHistorySection` (§347) liste les bilans passés avec un détail **read-only**.

## Décision (validée)

Éditer **uniquement les scores physiques** d'un ancien bilan (mobilité/mouvement **G/D** + notes par axe + note de synthèse). Le questionnaire et les KPIs (écrans dédiés `StrengthQuestionnaire`/`KpiWizard`, modèles différents) sont **hors scope**. **Approche A** : réutiliser le formulaire bilatéral existant en « mode édition » (vs édition inline dans la ligne, ou sheet/modal — écartées : duplication / couche en plus).

## Architecture

- **État** : `editingAssessmentId: string | null` dans `StrengthAssessmentScreen`.
- **Déclenchement** : `BilanHistorySection` reçoit une prop `onEdit?: (a: StrengthAssessment) => void` et affiche un bouton **« Éditer »** sur chaque ligne **déjà notée** (`physical_tests` présent). Le handler de l'écran fait : `setEditingAssessmentId(a.id)` + préremplit `scores` via `scoreStateFromNormalized(normalizePhysicalTests(a.physical_tests))`.
- **Rendu** : le bloc formulaire bilatéral s'affiche quand `isScoring` **OU** `editingAssessmentId != null`. En mode édition : **bandeau** « Édition du bilan du {date} » + bouton **« Annuler »** (clear `editingAssessmentId`, ré-aligne `scores` sur le dernier bilan).
- **Garde du préremplissage** : l'effet qui prérempli `scores` depuis le **dernier** bilan est gardé par `!editingAssessmentId` (sinon il écraserait les scores de l'ancien bilan en cours d'édition).
- **Sauvegarde** : la mutation physique cible `editingAssessmentId ?? assessment.id`. `updateAssessmentPhysicalTests` pose déjà `status:'completed'` → un bilan complété **reste** complété ; `created_at` inchangé → reste à sa place dans l'historique. Sur succès : clear `editingAssessmentId` + invalidation `["assessment-history", athleteId]` + `["strength-assessment", athleteId]` → l'édition se reflète aussitôt.

## Data flow

`BilanHistorySection (onEdit)` → `StrengthAssessmentScreen` (`editingAssessmentId` + prefill) → formulaire bilatéral (mode édition) → submit → `updateAssessmentPhysicalTests(editingAssessmentId, payload v2)` → invalidation → historique + détail à jour.

## Gestion des cas limites

- **Aucun `physical_tests`** (bilan `questionnaire_pending`) → pas de bouton « Éditer » (rien à éditer côté physique).
- **Annuler** → restaure la vue normale (le `scores` repart du dernier bilan via l'effet, désormais non gardé).
- Pas de conflit avec une saisie de nouveau bilan en cours : « Éditer » ne s'offre que depuis l'historique ; « Annuler » revient à l'état précédent.

## Tests

- vitest (`StrengthAssessmentScreen`) : depuis l'historique, cliquer « Éditer » sur un ancien bilan (id `X`) → le formulaire est prérempli avec ses scores → modifier la droite d'un axe → **sauvegarder appelle `updateAssessmentPhysicalTests("X", …)`** avec la nouvelle valeur (pas l'id du dernier).
- vitest léger : le bouton « Éditer » n'apparaît que sur les lignes avec `physical_tests`.

## Hors scope

- Édition du questionnaire / des KPIs d'un ancien bilan.
- Suppression d'un bilan.
