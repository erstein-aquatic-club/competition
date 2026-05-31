-- 00215_warmup_bloc3.sql — §352 Bloc 3 activation + correctif unilatéral + Raise

-- (1) Colonne unilatéral (Bloc 2 correctif côté faible).
ALTER TABLE dim_exercices ADD COLUMN IF NOT EXISTS supports_unilateral boolean NOT NULL DEFAULT false;
UPDATE dim_exercices SET supports_unilateral = true WHERE id IN (59, 85, 86, 73);
-- 59 Hip Airplane, 85 90/90 Hip Switch, 86 Hip Flexor Stretch, 73 Rowing élastique unilatéral

-- (2) Nouveaux exos légers (Raise + activation jambes), bucket 'mobility' = prep léger
-- (hors sélection principale ; chargés en activation via le chemin isWarmup). Idempotent.
-- NB: exercise_type est NOT NULL CHECK IN ('strength','warmup') → 'warmup' pour ces exos légers.
INSERT INTO dim_exercices (nom_exercice, exercise_type, bucket, level, is_core, contraindication_zones,
  nb_series_endurance, nb_reps_endurance, pourcentage_charge_1rm_endurance, recup_series_endurance)
SELECT v.* FROM (VALUES
  ('Mise en route (montées de genoux / corde à sauter)', 'warmup', 'mobility', 'beginner', false, '{}'::text[], 1, 30, 0, 20),
  ('Glute bridge (poids du corps)',                       'warmup', 'mobility', 'beginner', false, '{}'::text[], 2, 12, 0, 30),
  ('Monster walk élastique',                              'warmup', 'mobility', 'beginner', false, '{}'::text[], 2, 12, 0, 30)
) AS v(nom_exercice, exercise_type, bucket, level, is_core, contraindication_zones,
       nb_series_endurance, nb_reps_endurance, pourcentage_charge_1rm_endurance, recup_series_endurance)
WHERE NOT EXISTS (SELECT 1 FROM dim_exercices d WHERE d.nom_exercice = v.nom_exercice);

-- (3) Table activation (Bloc 3), parallèle de warmup_common_routine.
CREATE TABLE IF NOT EXISTS warmup_activation_routine (
  id          serial PRIMARY KEY,
  bucket      text NOT NULL,
  ordre       int  NOT NULL,
  exercise_id int  NOT NULL REFERENCES dim_exercices(id)
);
ALTER TABLE warmup_activation_routine ENABLE ROW LEVEL SECURITY;
CREATE POLICY warmup_activation_routine_read ON warmup_activation_routine
  FOR SELECT USING (app_user_role() IS NOT NULL);
CREATE POLICY warmup_activation_routine_write ON warmup_activation_routine
  FOR ALL USING (app_user_role() IN ('coach','admin'))
  WITH CHECK (app_user_role() IN ('coach','admin'));

-- Seed activation par seau. Les exos existants par id ; les nouveaux par nom (id serial inconnu).
INSERT INTO warmup_activation_routine (bucket, ordre, exercise_id) VALUES
  ('upper_strength', 1, 74),  -- Rowing élastique penché
  ('upper_strength', 2, 49),  -- Face Pull
  ('upper_power',    1, 49),  -- Face Pull
  ('upper_power',    2, 51);  -- Serratus Wall Slide
INSERT INTO warmup_activation_routine (bucket, ordre, exercise_id)
SELECT 'lower_strength', 1, id FROM dim_exercices WHERE nom_exercice = 'Glute bridge (poids du corps)';
INSERT INTO warmup_activation_routine (bucket, ordre, exercise_id) VALUES ('lower_strength', 2, 93); -- glute machine
INSERT INTO warmup_activation_routine (bucket, ordre, exercise_id)
SELECT 'lower_power', 1, id FROM dim_exercices WHERE nom_exercice = 'Monster walk élastique';
INSERT INTO warmup_activation_routine (bucket, ordre, exercise_id) VALUES ('lower_power', 2, 93);

-- (4) Raise en tête de warmup_common_routine (ordre 0). Idempotent.
INSERT INTO warmup_common_routine (ordre, exercise_id)
SELECT 0, id FROM dim_exercices WHERE nom_exercice = 'Mise en route (montées de genoux / corde à sauter)'
  AND NOT EXISTS (
    SELECT 1 FROM warmup_common_routine w
    JOIN dim_exercices d ON d.id = w.exercise_id
    WHERE d.nom_exercice = 'Mise en route (montées de genoux / corde à sauter)'
  );
