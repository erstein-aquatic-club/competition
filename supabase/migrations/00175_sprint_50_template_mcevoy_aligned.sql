-- 00175_sprint_50_template_mcevoy_aligned.sql
-- §293-fix : refonte du template `sprint_50` saison sur la signature de la
-- prépa Cameron McEvoy adaptée par F. Wagner (training_plans id=2).
--
-- Constat (cf. comparaison vs training_plan id=2, 10 sem, 4 séances/sem) :
--
--  Le template initial (mig 00169) focalisait sur la PUISSANCE
--  (upper_power 1.0, lower_power 0.95, upper_strength 0.6) avec 5 phases
--  force_max(2) → maintien(1) → puissance(2) → affutage(3) → pic(1).
--
--  La prépa McEvoy a en réalité 7 phases distinctes : reprise/tests → bloc
--  force max (Tractions+Squat) → bloc remise en charge légère « PDC/élastique »
--  → bloc puissance (Trap Bar Jump + Box Jump) → maintien → affûtage → pic.
--
--  Et `bucket_emphasis` doit privilégier upper_STRENGTH (Tractions, Bench
--  Pull = piliers absolus en muscu pour le sprint) plus que upper_power
--  (qui en muscu suit la force, sauf 1 séance Lancer médecine-ball/sem).
--
-- Conséquences :
--  • Phases : 7 phases reflétant fidèlement la séquence McEvoy.
--  • Plage durée : 8-16 semaines (au lieu de 7-15) — accueille les 10 sem
--    McEvoy en nominal (= 1+3+1+3+1+1+1).
--  • Emphasis rééquilibrée : upper_strength leader (Tractions, Bench Pull),
--    lower_power second (Trap Bar Jump, Box Jump), lower_strength tiers
--    (Squat), upper_power complément (Lancer médecine-ball secondaire),
--    mobility en warmup uniquement.
--
-- Note : 2 phases `prepa_generale` dans la séquence (S1 reprise + S5 PDC).
-- C'est intentionnel et fidèle à McEvoy — le moteur supporte cette répétition.

BEGIN;

UPDATE strength_periodization_templates
   SET name = 'Sprint 50 m — Force / Puissance (McEvoy-aligned)',
       min_week_count = 8,
       max_week_count = 16,
       structure = jsonb_build_object(
         'phases', jsonb_build_array(
           -- S1 : Reprise / tests 5RM (1 séance dans la pratique)
           jsonb_build_object('cycle', 'prepa_generale', 'min_weeks', 1, 'nominal_weeks', 1, 'max_weeks', 2),
           -- S2-4 : Force max bloc gym (Tractions+Squat, Deadlift+Bench Pull, …)
           jsonb_build_object('cycle', 'force_max',      'min_weeks', 2, 'nominal_weeks', 3, 'max_weeks', 4),
           -- S5 : Remise en charge légère PDC/élastique (intercalée entre force max et puissance)
           jsonb_build_object('cycle', 'prepa_generale', 'min_weeks', 0, 'nominal_weeks', 1, 'max_weeks', 2),
           -- S6-8 : Bloc puissance (Trap Bar Jump, Box Jump, Squat sauté chargé léger)
           jsonb_build_object('cycle', 'puissance',      'min_weeks', 2, 'nominal_weeks', 3, 'max_weeks', 4),
           -- S9 : Maintien (Bench Pull + Trap bar deadlift réduits, ~75-80%)
           jsonb_build_object('cycle', 'maintien',       'min_weeks', 1, 'nominal_weeks', 1, 'max_weeks', 2),
           -- S10 : Affûtage (Tractions + Box Jumps, volume très réduit)
           jsonb_build_object('cycle', 'affutage',       'min_weeks', 1, 'nominal_weeks', 1, 'max_weeks', 2),
           -- S11 : Pic (Activation Trap Bar Jump + Box Jump seulement)
           jsonb_build_object('cycle', 'pic',            'min_weeks', 1, 'nominal_weeks', 1, 'max_weeks', 1)
         ),
         'bucket_emphasis', jsonb_build_object(
           'upper_strength', 1.0,   -- Tractions lestées, Bench Pull, Dips = piliers absolus
           'lower_strength', 0.85,  -- Squat arrière = pilier
           'lower_power',    0.9,   -- Trap Bar Jump, Box Jump = piliers explosifs
           'upper_power',    0.5,   -- Lancer médecine-ball secondaire
           'mobility',       0.3    -- Face Pull / Rotation externe en warmup
         )
       ),
       updated_at = now()
 WHERE event_group = 'sprint_50' AND kind = 'season';

COMMIT;
