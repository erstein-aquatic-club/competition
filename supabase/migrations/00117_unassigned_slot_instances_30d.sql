-- Migration 00117: get_unassigned_slot_instances_30d
--
-- Retourne, pour les 30 derniers jours (J-30 à J-1, aujourd'hui exclu),
-- la liste des occurrences de créneaux de natation (swim) actifs qui
-- n'ont reçu aucune séance assignée.
--
-- Convention de fenêtre alignée sur get_feedback_rates_all_athletes (§00121).
-- Mêmes exclusions : overrides status='cancelled' et session_assignments status='cancelled'.

DROP FUNCTION IF EXISTS get_unassigned_slot_instances_30d();

CREATE OR REPLACE FUNCTION get_unassigned_slot_instances_30d()
RETURNS TABLE (
  slot_id          uuid,
  scheduled_date   date,
  day_of_week      smallint,
  start_time       time,
  end_time         time,
  location         text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH
  since_date AS (
    SELECT (current_date - 30)::date AS d
  ),
  dates AS (
    SELECT gs::date AS d, EXTRACT(ISODOW FROM gs)::smallint AS dow
    FROM generate_series((SELECT d FROM since_date), current_date - 1, '1 day'::interval) gs
  ),
  expected AS (
    -- Slots récurrents : toutes les occurrences ISODOW dans la fenêtre
    SELECT ts.id AS slot_id, d.d AS scheduled_date, ts.day_of_week,
           ts.start_time, ts.end_time, ts.location
    FROM training_slots ts
    JOIN dates d ON d.dow = ts.day_of_week
    WHERE ts.is_active = true
      AND ts.session_type = 'swim'
      AND ts.scheduled_date IS NULL
    UNION ALL
    -- Slots one-off : garder si scheduled_date tombe dans la fenêtre
    SELECT ts.id, ts.scheduled_date, ts.day_of_week,
           ts.start_time, ts.end_time, ts.location
    FROM training_slots ts
    WHERE ts.is_active = true
      AND ts.session_type = 'swim'
      AND ts.scheduled_date IS NOT NULL
      AND ts.scheduled_date >= (SELECT d FROM since_date)
      AND ts.scheduled_date <  current_date
  ),
  cancelled AS (
    SELECT slot_id, override_date
    FROM training_slot_overrides
    WHERE status = 'cancelled'
      AND override_date >= (SELECT d FROM since_date)
      AND override_date <  current_date
  ),
  assigned AS (
    SELECT DISTINCT training_slot_id AS slot_id, scheduled_date
    FROM session_assignments
    WHERE training_slot_id IS NOT NULL
      AND assignment_type = 'swim'
      AND status <> 'cancelled'
      AND scheduled_date >= (SELECT d FROM since_date)
      AND scheduled_date <  current_date
  )
  SELECT e.slot_id, e.scheduled_date, e.day_of_week,
         e.start_time, e.end_time, e.location
  FROM expected e
  WHERE NOT EXISTS (
    SELECT 1 FROM cancelled c
    WHERE c.slot_id = e.slot_id AND c.override_date = e.scheduled_date
  )
  AND NOT EXISTS (
    SELECT 1 FROM assigned a
    WHERE a.slot_id = e.slot_id AND a.scheduled_date = e.scheduled_date
  )
  ORDER BY e.scheduled_date DESC, e.start_time;
$$;

GRANT EXECUTE ON FUNCTION get_unassigned_slot_instances_30d() TO authenticated;
