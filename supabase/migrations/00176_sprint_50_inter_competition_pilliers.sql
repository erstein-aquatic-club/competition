-- 00176_sprint_50_inter_competition_pilliers.sql
-- §293-fix : aligner la mini-prépa sprint_50 sur les piliers McEvoy.
--
-- Retour utilisateur : sur les cycles courts (mini-prépa inter_competition,
-- 5-8 sem), peu de Tractions apparaissent. Cause : `bucket_emphasis`
-- d'origine privilégie upper_power (1.0) vs upper_strength (0.6) → focus#1
-- et focus#2 = upper_power + lower_power → Tractions reléguées en maintien
-- (allocation faible).
--
-- Or pour un sprinter 50m en mini-prépa entre 2 compés, Tractions lestées
-- + Bench Pull (= upper_strength) restent les piliers absolus : même en
-- volume réduit ("Lundi force max maintenue" du pattern McEvoy), elles
-- doivent rester centrales.
--
-- Fix :
-- 1. bucket_emphasis rééquilibré → upper_strength leader (cohérent avec la
--    version "saison" McEvoy-aligned de la mig 00175).
-- 2. Phase maintien étendue (1→2 nominal, min/max ajustés) pour donner plus
--    de place au bloc "Tractions + Squat + Bench Pull à charge réduite".
--
-- Plage 5-8 sem préservée.

BEGIN;

UPDATE strength_periodization_templates
   SET structure = jsonb_build_object(
         'phases', jsonb_build_array(
           -- Maintien étendu : 2 sem nominal pour les piliers Tractions / Bench Pull / Squat
           -- à charge ~75-80% (style "Lundi Force max maintenue" McEvoy).
           jsonb_build_object('cycle', 'maintien',  'min_weeks', 1, 'nominal_weeks', 2, 'max_weeks', 3),
           -- Puissance : Trap Bar Jump + Box Jump + Bench Pull explosif.
           jsonb_build_object('cycle', 'puissance', 'min_weeks', 2, 'nominal_weeks', 2, 'max_weeks', 3),
           -- Affûtage avant la compé.
           jsonb_build_object('cycle', 'affutage',  'min_weeks', 1, 'nominal_weeks', 1, 'max_weeks', 1),
           -- Pic = activation.
           jsonb_build_object('cycle', 'pic',       'min_weeks', 1, 'nominal_weeks', 1, 'max_weeks', 1)
         ),
         'bucket_emphasis', jsonb_build_object(
           'upper_strength', 0.95,  -- Tractions, Bench Pull = piliers absolus sprint
           'lower_power',    0.9,   -- Trap Bar Jump, Box Jump = piliers explosifs
           'lower_strength', 0.6,   -- Squat en maintien
           'upper_power',    0.5,   -- Lancer médecine-ball secondaire
           'mobility',       0.3    -- Face Pull en warmup
         )
       ),
       updated_at = now()
 WHERE event_group = 'sprint_50' AND kind = 'inter_competition';

COMMIT;
