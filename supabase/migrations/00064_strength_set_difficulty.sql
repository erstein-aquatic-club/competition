-- Add optional difficulty rating per set (1-5 scale)
ALTER TABLE strength_set_logs ADD COLUMN IF NOT EXISTS difficulty SMALLINT CHECK (difficulty BETWEEN 1 AND 5);
COMMENT ON COLUMN strength_set_logs.difficulty IS 'Difficulté ressentie 1-5 (optionnel, renseigné par le nageur)';
