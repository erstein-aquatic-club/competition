-- v5 : rebase get_feedback_rates_all_athletes on top of get_swimmer_sessions (§148).
--
-- Context: v4 had 3 bugs documented in §148 design:
--   1. total_slots inflated by strength swimmer_training_slots (dim_sessions is swim-only).
--   2. assigned_count undercounted by strict start_time match (should be bucket match).
--   3. planned_absences not excluded from denominator.
--
-- Fix: single source of truth. get_swimmer_sessions already encodes:
--   - session_type filter (we keep swim only here)
--   - bucket match (morning/evening, cutoff 13h) with source_assignment_id fallback + attribute fallback
--   - planned_absences → is_absent flag
--   - individual > subgroup > group precedence
--
-- feedback_count remains independent (counts dim_sessions rows) — extra feedbacks
-- outside expected slots still count. Changing that would alter the KPI meaning
-- (clamped to 100% by the UI anyway); out of scope here.

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
    SELECT a.id AS athlete_id, gss.assignment_id
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
  totals AS (
    SELECT
      athlete_id,
      COUNT(*)::integer AS total_slots,
      COUNT(*) FILTER (WHERE assignment_id IS NOT NULL)::integer AS assigned_count
    FROM expected_sessions
    GROUP BY athlete_id
  ),
  feedbacks AS (
    SELECT ds.athlete_id, COUNT(*)::integer AS feedback_count
    FROM dim_sessions ds
    WHERE ds.session_date >= (current_date - days_back)::date
      AND ds.session_date <  current_date
      AND ds.athlete_id IS NOT NULL
    GROUP BY ds.athlete_id
  )
  SELECT
    t.athlete_id,
    t.assigned_count,
    COALESCE(f.feedback_count, 0) AS feedback_count,
    t.total_slots
  FROM totals t
  LEFT JOIN feedbacks f ON f.athlete_id = t.athlete_id;
$function$;

COMMENT ON FUNCTION public.get_feedback_rates_all_athletes(integer) IS
  'v5 (§148): rebased on get_swimmer_sessions — swim-only, bucket match, planned_absences excluded. Replaces v3/v4 which had strict start_time match + strength inflation.';
