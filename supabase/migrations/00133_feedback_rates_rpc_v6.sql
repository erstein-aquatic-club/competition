-- §151: feedback_count = expected slots with at least one matching feedback
-- (not raw count of dim_sessions rows).
--
-- v5 (§148) counted every dim_sessions row in window, including feedbacks
-- submitted for non-expected slots (cancelled via cascade, hors planning).
-- The UI ratio was inflated (François 12/13 = 92%) vs actual match rate
-- (8/13 = 62%). §150 extended coach history view to surface this
-- discrepancy visually; this migration aligns the KPI with that view.
--
-- Matching rule (mirror of src/pages/coach/SwimmerFeedbackTab.tsx):
--   priority 1: ds.assignment_id = slot.assignment_id (when both non-null)
--   priority 2: ds.session_date = slot.scheduled_date AND
--               LOWER(ds.time_slot) = 'matin'|'soir' mapping of slot.bucket
--
-- dim_sessions.time_slot is stored in French ("Matin"/"Soir"); we also accept
-- the English form for forward-compat.

CREATE OR REPLACE FUNCTION public.get_feedback_rates_all_athletes(days_back integer DEFAULT 30)
 RETURNS TABLE(athlete_id integer, assigned_count integer, feedback_count integer, total_slots integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH
  athletes AS (
    SELECT id FROM users WHERE role = 'athlete'
  ),
  expected_sessions AS (
    SELECT a.id AS athlete_id,
           gss.scheduled_date,
           gss.bucket,
           gss.assignment_id
    FROM athletes a,
    LATERAL public.get_swimmer_sessions(
      a.id,
      (current_date - days_back)::date,
      (current_date - 1)::date,
      false
    ) gss
    WHERE gss.slot_session_type = 'swim'
      AND gss.is_absent = false
  ),
  expected_with_feedback AS (
    SELECT
      es.athlete_id,
      es.assignment_id,
      EXISTS (
        SELECT 1 FROM dim_sessions ds
        WHERE ds.athlete_id = es.athlete_id
          AND ds.session_date = es.scheduled_date
          AND (
            (es.assignment_id IS NOT NULL AND ds.assignment_id = es.assignment_id)
            OR LOWER(ds.time_slot) = CASE WHEN es.bucket = 'morning' THEN 'matin' ELSE 'soir' END
            OR LOWER(ds.time_slot) = es.bucket
          )
      ) AS has_feedback
    FROM expected_sessions es
  )
  SELECT
    athlete_id,
    COUNT(*) FILTER (WHERE assignment_id IS NOT NULL)::integer AS assigned_count,
    COUNT(*) FILTER (WHERE has_feedback)::integer AS feedback_count,
    COUNT(*)::integer AS total_slots
  FROM expected_with_feedback
  GROUP BY athlete_id;
$function$;

COMMENT ON FUNCTION public.get_feedback_rates_all_athletes(integer) IS
  'v6 (§151): feedback_count = expected slots with at least one matching feedback (priority assignment_id > date+bucket). Aligns with coach feedback history view.';
