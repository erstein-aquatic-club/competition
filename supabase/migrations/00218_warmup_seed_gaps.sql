-- 00218_warmup_seed_gaps.sql — §355 comble 2 trous de seed correctif (§351/§352) :
--   (A) rotation thoracique (t_spine n'avait que Cat-Cow, déjà dans la routine commune
--       → dédupliqué, donc 0 correctif dédié) ;
--   (B) correctif scapulaire UNILATÉRAL (les 4 exos scapula taggés sont bilatéraux →
--       le raffinement unilatéral §352 retombait sur du bilatéral).
-- Exos d'échauffement légers (`exercise_type='warmup'`, bucket mobility, beginner →
-- hors sélection principale), faisables PAR CÔTÉ (`supports_unilateral=true`).
-- Idempotent (WHERE NOT EXISTS sur le nom). Aucun changement moteur/RLS.

INSERT INTO dim_exercices (
  nom_exercice, exercise_type, bucket, level, is_core, contraindication_zones,
  corrective_axes, supports_unilateral,
  nb_series_endurance, nb_reps_endurance, pourcentage_charge_1rm_endurance, recup_series_endurance
)
SELECT v.* FROM (VALUES
  ('Rotation thoracique (open book)',          'warmup', 'mobility', 'beginner', false, '{}'::text[],
     ARRAY['t_spine']::text[],         true, 2,  8, 0, 30),
  ('Rowing scapulaire unilatéral (élastique)', 'warmup', 'mobility', 'beginner', false, '{}'::text[],
     ARRAY['scapula_control']::text[], true, 2, 10, 0, 30)
) AS v(nom_exercice, exercise_type, bucket, level, is_core, contraindication_zones,
       corrective_axes, supports_unilateral,
       nb_series_endurance, nb_reps_endurance, pourcentage_charge_1rm_endurance, recup_series_endurance)
WHERE NOT EXISTS (SELECT 1 FROM dim_exercices d WHERE d.nom_exercice = v.nom_exercice);
