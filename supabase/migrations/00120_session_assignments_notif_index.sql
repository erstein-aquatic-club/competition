-- Optimise le cron "Séance terminée ?" (104ms/call, 3922 calls/mois)
-- Index partiel sur les assignments non encore notifiés.
-- Non-CONCURRENTLY car appliqué via MCP (transaction wrapper). Table petite en volume.

CREATE INDEX IF NOT EXISTS idx_session_assignments_notif_pending
ON session_assignments (training_slot_id, scheduled_date)
WHERE notified_at IS NULL;

COMMENT ON INDEX idx_session_assignments_notif_pending IS
'Partial index pour cron notification fin de séance. Filtre sur notified_at IS NULL → table très réduite.';
