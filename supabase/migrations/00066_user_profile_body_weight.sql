-- Add body_weight column to user_profiles for relative strength score calculation
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS body_weight NUMERIC(4,1);
COMMENT ON COLUMN user_profiles.body_weight IS 'Poids corporel en kg pour le calcul des scores relatifs';
