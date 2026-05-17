-- 00165_dim_exercices_tagging_seed.sql
-- §291 — Chantier A : colonne is_core + seed du tagging des 94 exercices.
-- Mapping validé coach 2026-05-17 — cf. docs/plans/bilan-muscu-exercices-tagging.md.
BEGIN;

ALTER TABLE dim_exercices
  ADD COLUMN is_core BOOLEAN NOT NULL DEFAULT false;

-- Seed : bucket / contraindication_zones / level pour les 94 exercices.
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder,lower_back}', level = 'intermediate' WHERE id = 1;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder,left_elbow,right_elbow}', level = 'intermediate' WHERE id = 2;
UPDATE dim_exercices SET bucket = 'lower_strength', contraindication_zones = '{lower_back}', level = 'intermediate' WHERE id = 3;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder}', level = 'beginner' WHERE id = 4;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder,left_elbow,right_elbow}', level = 'intermediate' WHERE id = 5;
UPDATE dim_exercices SET bucket = 'lower_strength', contraindication_zones = '{left_knee,right_knee,lower_back,left_wrist,right_wrist}', level = 'intermediate' WHERE id = 6;
UPDATE dim_exercices SET bucket = 'lower_power', contraindication_zones = '{lower_back}', level = 'intermediate' WHERE id = 7;
UPDATE dim_exercices SET bucket = 'lower_power', contraindication_zones = '{left_knee,right_knee,left_ankle,right_ankle}', level = 'intermediate' WHERE id = 8;
UPDATE dim_exercices SET bucket = 'upper_power', contraindication_zones = '{left_shoulder,right_shoulder,lower_back}', level = 'beginner' WHERE id = 9;
UPDATE dim_exercices SET bucket = 'lower_power', contraindication_zones = '{left_ankle,right_ankle,left_calf}', level = 'beginner' WHERE id = 10;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder,left_elbow,right_elbow}', level = 'beginner' WHERE id = 11;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder}', level = 'beginner' WHERE id = 12;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder,left_elbow,right_elbow}', level = 'advanced' WHERE id = 13;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder,left_elbow,right_elbow}', level = 'intermediate' WHERE id = 14;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_wrist,right_wrist,left_hip,right_hip}', level = 'advanced' WHERE id = 15;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder,left_elbow,right_elbow}', level = 'beginner' WHERE id = 16;
UPDATE dim_exercices SET bucket = 'upper_power', contraindication_zones = '{left_shoulder,right_shoulder}', level = 'intermediate' WHERE id = 17;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder,lower_back}', level = 'beginner' WHERE id = 18;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder}', level = 'intermediate' WHERE id = 19;
UPDATE dim_exercices SET bucket = 'lower_power', contraindication_zones = '{left_knee,right_knee,left_ankle,right_ankle,lower_back}', level = 'intermediate' WHERE id = 20;
UPDATE dim_exercices SET bucket = 'lower_power', contraindication_zones = '{left_knee,right_knee,left_ankle,right_ankle}', level = 'intermediate' WHERE id = 21;
UPDATE dim_exercices SET bucket = 'lower_power', contraindication_zones = '{lower_back,left_hip,right_hip}', level = 'intermediate' WHERE id = 22;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder,lower_back}', level = 'intermediate' WHERE id = 23;
UPDATE dim_exercices SET bucket = 'mobility', contraindication_zones = '{}', level = 'beginner' WHERE id = 24;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder,lower_back}', level = 'intermediate' WHERE id = 25;
UPDATE dim_exercices SET bucket = 'lower_strength', contraindication_zones = '{left_knee,right_knee,lower_back}', level = 'intermediate' WHERE id = 26;
UPDATE dim_exercices SET bucket = 'lower_power', contraindication_zones = '{left_knee,right_knee,left_ankle,right_ankle}', level = 'intermediate' WHERE id = 27;
UPDATE dim_exercices SET bucket = 'lower_strength', contraindication_zones = '{left_knee,right_knee}', level = 'beginner' WHERE id = 28;
UPDATE dim_exercices SET bucket = 'lower_strength', contraindication_zones = '{left_knee,right_knee}', level = 'beginner' WHERE id = 29;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{upper_back,left_wrist,right_wrist}', level = 'beginner' WHERE id = 30;
UPDATE dim_exercices SET bucket = 'lower_power', contraindication_zones = '{left_knee,right_knee,left_wrist,right_wrist,left_shoulder,right_shoulder}', level = 'beginner' WHERE id = 31;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{neck,lower_back}', level = 'beginner' WHERE id = 32;
UPDATE dim_exercices SET bucket = 'lower_strength', contraindication_zones = '{left_knee,right_knee,left_hip,right_hip}', level = 'intermediate' WHERE id = 33;
UPDATE dim_exercices SET bucket = 'lower_strength', contraindication_zones = '{left_knee,right_knee}', level = 'beginner' WHERE id = 34;
UPDATE dim_exercices SET bucket = 'lower_strength', contraindication_zones = '{left_knee,right_knee,left_hip,right_hip}', level = 'beginner' WHERE id = 35;
UPDATE dim_exercices SET bucket = 'lower_strength', contraindication_zones = '{lower_back,left_hip,right_hip}', level = 'intermediate' WHERE id = 36;
UPDATE dim_exercices SET bucket = 'lower_strength', contraindication_zones = '{left_knee,right_knee,left_hip,right_hip}', level = 'beginner' WHERE id = 37;
UPDATE dim_exercices SET bucket = 'lower_strength', contraindication_zones = '{left_knee,right_knee}', level = 'advanced' WHERE id = 38;
UPDATE dim_exercices SET bucket = 'lower_strength', contraindication_zones = '{left_knee,right_knee,lower_back}', level = 'intermediate' WHERE id = 39;
UPDATE dim_exercices SET bucket = 'lower_strength', contraindication_zones = '{lower_back}', level = 'beginner' WHERE id = 40;
UPDATE dim_exercices SET bucket = 'lower_strength', contraindication_zones = '{left_ankle,right_ankle,left_calf}', level = 'beginner' WHERE id = 41;
UPDATE dim_exercices SET bucket = 'lower_strength', contraindication_zones = '{left_ankle,right_ankle,left_calf}', level = 'beginner' WHERE id = 42;
UPDATE dim_exercices SET bucket = 'lower_power', contraindication_zones = '{left_ankle,right_ankle,left_calf,left_knee,right_knee}', level = 'intermediate' WHERE id = 43;
UPDATE dim_exercices SET bucket = 'mobility', contraindication_zones = '{left_ankle,right_ankle,left_calf}', level = 'beginner' WHERE id = 44;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{}', level = 'beginner' WHERE id = 45;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{}', level = 'beginner' WHERE id = 46;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder}', level = 'beginner' WHERE id = 47;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_wrist,right_wrist,lower_back}', level = 'beginner' WHERE id = 48;
UPDATE dim_exercices SET bucket = 'mobility', contraindication_zones = '{}', level = 'beginner' WHERE id = 49;
UPDATE dim_exercices SET bucket = 'mobility', contraindication_zones = '{}', level = 'beginner' WHERE id = 50;
UPDATE dim_exercices SET bucket = 'mobility', contraindication_zones = '{}', level = 'beginner' WHERE id = 51;
UPDATE dim_exercices SET bucket = 'mobility', contraindication_zones = '{left_wrist,right_wrist}', level = 'beginner' WHERE id = 52;
UPDATE dim_exercices SET bucket = 'upper_power', contraindication_zones = '{lower_back,left_shoulder,right_shoulder}', level = 'intermediate' WHERE id = 53;
UPDATE dim_exercices SET bucket = 'upper_power', contraindication_zones = '{lower_back,left_shoulder,right_shoulder}', level = 'intermediate' WHERE id = 54;
UPDATE dim_exercices SET bucket = 'upper_power', contraindication_zones = '{left_shoulder,right_shoulder,lower_back}', level = 'intermediate' WHERE id = 55;
UPDATE dim_exercices SET bucket = 'lower_power', contraindication_zones = '{left_knee,right_knee,left_ankle,right_ankle}', level = 'advanced' WHERE id = 56;
UPDATE dim_exercices SET bucket = 'lower_strength', contraindication_zones = '{left_knee,right_knee,left_hip,right_hip}', level = 'beginner' WHERE id = 57;
UPDATE dim_exercices SET bucket = 'lower_strength', contraindication_zones = '{left_hip,right_hip}', level = 'intermediate' WHERE id = 58;
UPDATE dim_exercices SET bucket = 'mobility', contraindication_zones = '{left_hip,right_hip}', level = 'intermediate' WHERE id = 59;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder}', level = 'intermediate' WHERE id = 60;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{lower_back,neck}', level = 'intermediate' WHERE id = 61;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder,left_elbow,right_elbow,lower_back}', level = 'advanced' WHERE id = 62;
UPDATE dim_exercices SET bucket = 'lower_power', contraindication_zones = '{lower_back,left_wrist,right_wrist,left_shoulder,right_shoulder}', level = 'advanced' WHERE id = 63;
UPDATE dim_exercices SET bucket = 'lower_power', contraindication_zones = '{lower_back,left_wrist,right_wrist,left_shoulder,right_shoulder}', level = 'advanced' WHERE id = 64;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder,left_elbow,right_elbow}', level = 'intermediate' WHERE id = 65;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder,left_elbow,right_elbow}', level = 'advanced' WHERE id = 66;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder,left_elbow,right_elbow,lower_back}', level = 'advanced' WHERE id = 67;
UPDATE dim_exercices SET bucket = 'upper_power', contraindication_zones = '{left_shoulder,right_shoulder,left_elbow,right_elbow,lower_back}', level = 'advanced' WHERE id = 68;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder,left_elbow,right_elbow}', level = 'advanced' WHERE id = 69;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder,left_elbow,right_elbow}', level = 'beginner' WHERE id = 70;
UPDATE dim_exercices SET bucket = 'mobility', contraindication_zones = '{left_shoulder,right_shoulder}', level = 'beginner' WHERE id = 71;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{lower_back,left_shoulder,right_shoulder}', level = 'advanced' WHERE id = 72;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder}', level = 'beginner' WHERE id = 73;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder,lower_back}', level = 'beginner' WHERE id = 74;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder,left_wrist,right_wrist,lower_back}', level = 'beginner' WHERE id = 75;
UPDATE dim_exercices SET bucket = 'lower_power', contraindication_zones = '{left_knee,right_knee,left_ankle,right_ankle}', level = 'intermediate' WHERE id = 76;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder,left_wrist,right_wrist,left_elbow,right_elbow}', level = 'intermediate' WHERE id = 77;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{lower_back,neck}', level = 'beginner' WHERE id = 78;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder,lower_back}', level = 'intermediate' WHERE id = 79;
UPDATE dim_exercices SET bucket = 'lower_strength', contraindication_zones = '{lower_back}', level = 'beginner' WHERE id = 80;
UPDATE dim_exercices SET bucket = 'lower_power', contraindication_zones = '{left_wrist,right_wrist,left_shoulder,right_shoulder,lower_back}', level = 'beginner' WHERE id = 81;
UPDATE dim_exercices SET bucket = 'upper_strength', contraindication_zones = '{left_shoulder,right_shoulder,left_wrist,right_wrist}', level = 'beginner' WHERE id = 82;
UPDATE dim_exercices SET bucket = 'mobility', contraindication_zones = '{left_shoulder,right_shoulder,lower_back}', level = 'beginner' WHERE id = 83;
UPDATE dim_exercices SET bucket = 'mobility', contraindication_zones = '{left_shoulder,right_shoulder}', level = 'beginner' WHERE id = 84;
UPDATE dim_exercices SET bucket = 'mobility', contraindication_zones = '{left_hip,right_hip}', level = 'beginner' WHERE id = 85;
UPDATE dim_exercices SET bucket = 'mobility', contraindication_zones = '{left_hip,right_hip}', level = 'beginner' WHERE id = 86;
UPDATE dim_exercices SET bucket = 'mobility', contraindication_zones = '{}', level = 'beginner' WHERE id = 87;
UPDATE dim_exercices SET bucket = 'mobility', contraindication_zones = '{left_ankle,right_ankle}', level = 'beginner' WHERE id = 88;
UPDATE dim_exercices SET bucket = 'mobility', contraindication_zones = '{left_ankle,right_ankle,left_knee,right_knee}', level = 'beginner' WHERE id = 89;
UPDATE dim_exercices SET bucket = 'lower_power', contraindication_zones = '{lower_back,left_ankle,right_ankle}', level = 'intermediate' WHERE id = 90;
UPDATE dim_exercices SET bucket = 'upper_power', contraindication_zones = '{left_shoulder,right_shoulder,left_wrist,right_wrist,left_elbow,right_elbow}', level = 'advanced' WHERE id = 91;
UPDATE dim_exercices SET bucket = 'lower_power', contraindication_zones = '{left_knee,right_knee,left_ankle,right_ankle}', level = 'intermediate' WHERE id = 92;
UPDATE dim_exercices SET bucket = 'lower_strength', contraindication_zones = '{left_hip,right_hip}', level = 'beginner' WHERE id = 93;
UPDATE dim_exercices SET bucket = 'lower_power', contraindication_zones = '{left_knee,right_knee,left_ankle,right_ankle}', level = 'intermediate' WHERE id = 94;

-- is_core = true pour les exercices de tronc (cf. O-1 du doc validé).
UPDATE dim_exercices SET is_core = true WHERE id IN (15, 23, 32, 72, 75, 78, 79, 80, 82, 83);

COMMIT;
