-- Migration 00118: Replace get_feedback_rates_all_athletes (v2)
--
-- v1 (00117) counted all theoretical slot occurrences (slot × date), which
-- gave every swimmer the same inflated number regardless of presence or
-- whether the coach actually planned a session on that slot.
--
-- v2 counts only session_assignments rows that are:
--   • linked to a training slot (training_slot_id IS NOT NULL)
--   • in the last N days (scheduled_date in [current_date-days_back, yesterday])
--   • not cancelled
-- Group assignments are expanded to individual swimmer members.
-- Individual (target_user_id) assignments are also included.

CREATE OR REPLACE FUNCTION get_feedback_rates_all_athletes(days_back integer DEFAULT 30)
RETURNS TABLE (athlete_id integer, assigned_count integer, feedback_count integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH
  since_date AS (
    SELECT (current_date - days_back)::date AS d
  ),
  -- Slot-based assignments that occurred in the window and were not cancelled
  slot_assignments AS (
    SELECT
      sa.id,
      sa.target_group_id,
      sa.target_user_id
    FROM session_assignments sa
    WHERE sa.training_slot_id IS NOT NULL
      AND sa.scheduled_date >= (SELECT d FROM since_date)
      AND sa.scheduled_date <  current_date
      AND sa.status <> 'cancelled'
  ),
  -- Expand group assignments → one row per swimmer in the group
  group_expanded AS (
    SELECT DISTINCT
      gm.user_id,
      sa.id AS assignment_id
    FROM slot_assignments sa
    JOIN group_members gm ON gm.group_id = sa.target_group_id
    WHERE sa.target_group_id IS NOT NULL
  ),
  -- Direct (individual) assignments
  user_direct AS (
    SELECT DISTINCT
      sa.target_user_id AS user_id,
      sa.id             AS assignment_id
    FROM slot_assignments sa
    WHERE sa.target_user_id IS NOT NULL
  ),
  -- Union, keep only athletes
  all_assignments AS (
    SELECT ge.user_id, ge.assignment_id FROM group_expanded ge
    UNION
    SELECT ud.user_id, ud.assignment_id FROM user_direct ud
  ),
  assigned AS (
    SELECT aa.user_id, COUNT(DISTINCT aa.assignment_id) AS cnt
    FROM all_assignments aa
    JOIN users u ON u.id = aa.user_id AND u.role = 'athlete'
    GROUP BY aa.user_id
  ),
  -- Feedbacks submitted by the swimmer in the same window
  feedbacks AS (
    SELECT ds.athlete_id, COUNT(*) AS cnt
    FROM dim_sessions ds
    WHERE ds.session_date >= (SELECT d FROM since_date)
      AND ds.session_date <  current_date
      AND ds.athlete_id IS NOT NULL
    GROUP BY ds.athlete_id
  )
  SELECT
    a.user_id::integer          AS athlete_id,
    a.cnt::integer              AS assigned_count,
    COALESCE(f.cnt, 0)::integer AS feedback_count
  FROM assigned a
  LEFT JOIN feedbacks f ON f.athlete_id = a.user_id;
$$;
