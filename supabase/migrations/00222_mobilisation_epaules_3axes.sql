-- §360 — Mobilisation épaules 3 axes (nageur)
-- Remplace Y-T-W épaules (id=24) dans la routine d'échauffement commune
-- et dans toutes les séances générées (strength_session_items).
-- Les strength_set_logs (historique réel) sont intentionnellement conservés.

DO $$
DECLARE
  new_id INTEGER;
BEGIN
  INSERT INTO dim_exercices (
    nom_exercice,
    description,
    exercise_type,
    exercise_subtype,
    bucket,
    corrective_axes,
    is_bodyweight,
    intensity_metric,
    level,
    is_core,
    supports_unilateral,
    nb_series_endurance,  nb_reps_endurance,
    nb_series_hypertrophie, nb_reps_hypertrophie,
    nb_series_force,      nb_reps_force,
    pourcentage_charge_1rm_endurance,
    pourcentage_charge_1rm_hypertrophie,
    pourcentage_charge_1rm_force,
    recup_series_endurance,    recup_exercices_endurance,
    recup_series_hypertrophie, recup_exercices_hypertrophie,
    recup_series_force,        recup_exercices_force,
    selection_priority,
    warmup_reps,
    warmup_duration
  ) VALUES (
    'Mobilisation épaules 3 axes (nageur)',
    'Échauffement épaule spécifique natation — 3 phases enchaînées à vide, coudes à 90° : '
    '(1) extension en position flèche ×5 reps, '
    '(2) rotation avant-bras parallèles au sol paume vers bas ×5 reps, '
    '(3) adduction coudes vers le corps par pivotement sur le 3ᵉ axe ×5 reps.',
    'strength',
    'prehab',
    'mobility',
    ARRAY['shoulder_flexion', 'shoulder_rotation'],
    false,
    'weight_kg',
    'beginner',
    false,
    false,
    2, 15,
    2, 15,
    2, 15,
    0, 0, 0,
    45,  90,
    60, 120,
    75, 150,
    0,
    15,
    null
  )
  RETURNING id INTO new_id;

  -- Bloc 1 warm-up : remplace YTW (ordre=3)
  UPDATE warmup_common_routine
  SET exercise_id = new_id
  WHERE exercise_id = 24;

  -- Séances générées existantes (18 strength_session_items)
  UPDATE strength_session_items
  SET exercise_id = new_id
  WHERE exercise_id = 24;
END $$;
