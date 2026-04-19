-- Drop 11 indexes "safe to drop" — audit complet 57 indexes unused_index (advisor Supabase).
--
-- Contexte : sur les 57 indexes flaggés par l'advisor, 46 sont load-bearing :
--   - 43 FK indexes (déclarés ou sémantiques) → protègent JOIN + cascade DELETE
--   - 3 matches feature code actif (training_slots_scheduled_date, timesheet_shifts_date, swim_records_date)
-- Les 11 ci-dessous sont SAFE TO DROP : timestamps techniques, low cardinality,
-- colonnes jamais filtrées, ou redondances déjà couvertes par d'autres indexes.
--
-- Classification complète : docs/plans/2026-04-18-unused-indexes-audit.md.
-- Réversible à tout moment via CREATE INDEX CONCURRENTLY.

-- Timestamps techniques, aucun ORDER BY / WHERE côté app
DROP INDEX IF EXISTS idx_dim_sessions_created;
DROP INDEX IF EXISTS idx_users_created;
DROP INDEX IF EXISTS idx_strength_set_logs_completed;

-- Colonnes dénormalisées / redondantes (couvertes par autres indexes ou jamais filtrées)
DROP INDEX IF EXISTS idx_dim_sessions_name_date;
DROP INDEX IF EXISTS idx_assignments_status;
DROP INDEX IF EXISTS idx_sa_visible_from;

-- Low cardinality (sélectivité btree trop faible pour être utile)
DROP INDEX IF EXISTS idx_import_logs_status;
DROP INDEX IF EXISTS idx_training_slots_day;
DROP INDEX IF EXISTS idx_training_slots_session_type;
DROP INDEX IF EXISTS club_record_swimmers_active_idx;

-- Tables petites (<50 rows) où seq scan bat index lookup
DROP INDEX IF EXISTS idx_groups_temporary;
