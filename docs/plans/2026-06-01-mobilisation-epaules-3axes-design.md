# Design — Mobilisation épaules 3 axes (nageur)

**Date** : 2026-06-01  
**§** : 360

## Contexte

Remplacement du Y-T-W épaules (id=24) dans la routine d'échauffement articulaire commune (Bloc 1) par un exercice spécifique natation décrit par le coach/nageur François Wagner : mobilisation en 3 phases enchaînées à vide, coudes à 90°.

## Exercice

**Nom** : `Mobilisation épaules 3 axes (nageur)`

3 phases enchaînées, à vide (bodyweight), coudes à 90° tout au long :
1. Extension vers le haut en position flèche ×5 reps
2. Rotation épaules → avant-bras parallèles au sol, paumes vers le bas ×5 reps
3. Adduction coudes vers le corps par pivotement sur le 3ᵉ axe ×5 reps

Total : 15 reps par série.

## Périmètre de la migration (00221)

| Action | Table | Détail |
|--------|-------|--------|
| INSERT | `dim_exercices` | Nouvel exercice, copie profil YWT + bodyweight + 3 axes |
| UPDATE | `warmup_common_routine` | ordre=3 : exercise_id=24 → new_id |
| UPDATE | `strength_session_items` | 18 lignes exercise_id=24 → new_id |
| SKIP | `strength_set_logs` | 2 entrées historiques conservées (performance réelle) |

YWT (id=24) reste dans le catalogue sans modification.

## Config `dim_exercices`

- `bucket` : `mobility`
- `exercise_subtype` : `prehab`
- `corrective_axes` : `['shoulder_flexion', 'shoulder_rotation']`
- `is_bodyweight` : `true`, `intensity_metric` : `reps`
- `warmup_reps` : `15`, `nb_reps_*` : `15`, `nb_series_*` : `2`
- `level` : `beginner`, `selection_priority` : `0`
