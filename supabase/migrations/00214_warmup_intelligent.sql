-- 00214_warmup_intelligent.sql — Échauffement intelligent §351
-- (1) tag d'axe correctif sur les exos mobilité ; (2) routine articulaire commune.

ALTER TABLE dim_exercices ADD COLUMN IF NOT EXISTS corrective_axes text[] NOT NULL DEFAULT '{}';

-- Seed des tags d'axe (exos du seau mobility, ids vérifiés sur prod).
UPDATE dim_exercices SET corrective_axes = '{shoulder_flexion}'              WHERE id = 24;  -- Y-T-W épaules
UPDATE dim_exercices SET corrective_axes = '{shoulder_flexion}'              WHERE id = 84;  -- Shoulder Dislocates
UPDATE dim_exercices SET corrective_axes = '{t_spine,trunk_neck_alignment}' WHERE id = 87;  -- Cat-Cow
UPDATE dim_exercices SET corrective_axes = '{hip,hip_hinge}'                 WHERE id = 59;  -- Hip Airplane
UPDATE dim_exercices SET corrective_axes = '{hip,hip_hinge}'                 WHERE id = 85;  -- 90/90 Hip Switch
UPDATE dim_exercices SET corrective_axes = '{hip}'                           WHERE id = 86;  -- Hip Flexor Stretch
UPDATE dim_exercices SET corrective_axes = '{scapula_control}'              WHERE id = 49;  -- Face Pull
UPDATE dim_exercices SET corrective_axes = '{scapula_control}'              WHERE id = 51;  -- Serratus Wall Slide
UPDATE dim_exercices SET corrective_axes = '{scapula_control}'              WHERE id = 52;  -- Pompe scapulaire
UPDATE dim_exercices SET corrective_axes = '{scapula_control}'              WHERE id = 71;  -- Scapula Pull-Up
UPDATE dim_exercices SET corrective_axes = '{trunk_neck_alignment}'         WHERE id = 83;  -- Streamline Hold

CREATE TABLE IF NOT EXISTS warmup_common_routine (
  id          serial PRIMARY KEY,
  ordre       int  NOT NULL,
  exercise_id int  NOT NULL REFERENCES dim_exercices(id)
);

ALTER TABLE warmup_common_routine ENABLE ROW LEVEL SECURITY;

CREATE POLICY warmup_common_routine_read ON warmup_common_routine
  FOR SELECT USING (app_user_role() IS NOT NULL);

CREATE POLICY warmup_common_routine_write ON warmup_common_routine
  FOR ALL USING (app_user_role() IN ('coach','admin'))
  WITH CHECK (app_user_role() IN ('coach','admin'));

-- Seed : routine articulaire générique sans contre-indication.
INSERT INTO warmup_common_routine (ordre, exercise_id) VALUES
  (1, 87),  -- Cat-Cow
  (2, 84),  -- Shoulder Dislocates
  (3, 24);  -- Y-T-W épaules
