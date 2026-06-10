-- 00228_box_jump_height_metric.sql
-- Backfill différé du §298 : Box Jump se mesure par la hauteur de box (cm),
-- pas en kg. Bascule l'exercice sur la métrique d'intensité `height_cm` pour
-- que le runner affiche « Hauteur (cm) » et désactive le gating 1RM / %1RM.
-- (Le §298 avait posé l'infrastructure mais laissé le backfill au coach.)

UPDATE dim_exercices
SET intensity_metric = 'height_cm',
    -- métrique non-poids → pas de %1RM ni de poids de corps (cohérence catalogue)
    is_bodyweight = false,
    pourcentage_charge_1rm_endurance = NULL,
    pourcentage_charge_1rm_hypertrophie = NULL,
    pourcentage_charge_1rm_force = NULL
WHERE nom_exercice = 'Box Jump'
  AND intensity_metric = 'weight_kg';
