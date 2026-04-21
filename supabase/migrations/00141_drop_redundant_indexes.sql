-- §162 Sprint 1 perf — Drop 2 indexes strictement redondants avec des UNIQUE constraints.
-- Chaque DROP est accompagné de la raison.
-- Les autres indexes 'unused' signalés par l'advisor sont des FK indexes ou des
-- composites spécifiques qui deviendront utiles dès que les tables se rempliront :
-- on les garde pour éviter de re-payer le coût au premier usage.

-- session_attendance_session_idx (session_id) est strictement couvert par
-- session_attendance_session_id_athlete_id_key (UNIQUE session_id, athlete_id),
-- dont la colonne session_id est en tête → tout SELECT WHERE session_id = ?
-- utilise l'index unique. Index redondant.
DROP INDEX IF EXISTS public.session_attendance_session_idx;

-- idx_notification_dismissals_user (user_id) est strictement couvert par
-- notification_dismissals_user_id_notification_id_key (UNIQUE user_id,
-- notification_id), dont user_id est en tête. Index redondant.
DROP INDEX IF EXISTS public.idx_notification_dismissals_user;
