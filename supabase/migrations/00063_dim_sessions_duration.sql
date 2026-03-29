ALTER TABLE dim_sessions ADD COLUMN IF NOT EXISTS session_duration_minutes INTEGER;
COMMENT ON COLUMN dim_sessions.session_duration_minutes IS 'Durée session en minutes, dérivée du créneau ou saisie manuellement';
