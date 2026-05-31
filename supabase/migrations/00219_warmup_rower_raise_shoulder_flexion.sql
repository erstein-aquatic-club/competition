-- 00219_warmup_rower_raise_shoulder_flexion.sql — §356
-- (1) Le « Raise » du Bloc 1 devient le RAMEUR (matériel dispo, full-body, doux
--     pour l'épaule — préféré à la corde à sauter pour des nageurs). On repurpose
--     l'exo de mise en route existant (id 97, seul référencé par warmup_common_routine).
-- (2) Comble le trou FLEXION D'ÉPAULE : ses 2 exos taggés (Y-T-W 24, Shoulder
--     Dislocates 84) sont dans la routine commune → dédupliqués → 0 correctif dédié.
--     Ajout d'un correctif flexion d'épaule HORS routine commune, par côté, élastique.
-- Data-only sur dim_exercices ; aucun changement moteur/RLS.

-- (1) Raise → rameur ergomètre (~3 min easy). Idempotent (UPDATE par id).
UPDATE dim_exercices
SET nom_exercice = 'Mise en route — rameur ergomètre (~3 min)',
    nb_series_endurance = 1,
    nb_reps_endurance = 1
WHERE id = 97;

-- (2) Correctif flexion d'épaule dédié (overhead élastique / wall slide), unilatéral.
INSERT INTO dim_exercices (
  nom_exercice, exercise_type, bucket, level, is_core, contraindication_zones,
  corrective_axes, supports_unilateral,
  nb_series_endurance, nb_reps_endurance, pourcentage_charge_1rm_endurance, recup_series_endurance
)
SELECT v.* FROM (VALUES
  ('Mobilité flexion d''épaule (overhead élastique / wall slide)', 'warmup', 'mobility', 'beginner', false,
     ARRAY['left_shoulder','right_shoulder']::text[],  -- contre-indiqué si douleur d'épaule
     ARRAY['shoulder_flexion']::text[], true, 2, 10, 0, 30)
) AS v(nom_exercice, exercise_type, bucket, level, is_core, contraindication_zones,
       corrective_axes, supports_unilateral,
       nb_series_endurance, nb_reps_endurance, pourcentage_charge_1rm_endurance, recup_series_endurance)
WHERE NOT EXISTS (SELECT 1 FROM dim_exercices d WHERE d.nom_exercice = v.nom_exercice);
