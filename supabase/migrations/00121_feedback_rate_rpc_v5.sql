-- Migration 00121: Replace get_feedback_rates_all_athletes (v5)
--
-- Adds total_slots to the result: the number of recurring slot occurrences
-- (from swimmer_training_slots) that fell in the window, regardless of whether
-- the coach assigned a session on them.
--
-- total_slots  = all expected slot instances for this swimmer
-- assigned_count = those that had a coach-assigned session
-- feedback_count = feedbacks actually submitted by the swimmer
--
-- When assigned_count < total_slots the coach has a gap (unplanned slots).
-- The swimmer can still submit feedback outside assignments.

DROP FUNCTION IF EXISTS get_feedback_rates_all_athletes(integer);

CREATE OR REPLACE FUNCTION get_feedback_rates_all_athletes(days_back integer DEFAULT 30)
RETURNS TABLE (
  athlete_id     integer,
  assigned_count integer,
  feedback_count integer,
  total_slots    integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH
  since_date AS (
    SELECT (current_date - days_back)::date AS d
  ),
  -- Past dates in the window with their ISO day-of-week (1=Mon … 7=Sun)
  dates AS (
    SELECT
      gs::date                           AS d,
      EXTRACT(ISODOW FROM gs)::smallint  AS dow
    FROM generate_series(
      (SELECT d FROM since_date),
      current_date - 1,
      '1 day'::interval
    ) gs
  ),
  -- Swimmers who have at least one active custom slot
  swimmers_with_custom_slots AS (
    SELECT DISTINCT user_id
    FROM swimmer_training_slots
    WHERE is_active = true
  ),
  -- ── ASSIGNED COUNT (v4 logic) ────────────────────────────────────────────
  slot_sa AS (
    SELECT sa.id, sa.training_slot_id, sa.target_group_id, sa.target_user_id
    FROM session_assignments sa
    WHERE sa.training_slot_id IS NOT NULL
      AND sa.scheduled_date >= (SELECT d FROM since_date)
      AND sa.scheduled_date <  current_date
      AND sa.status <> 'cancelled'
  ),
  group_custom AS (
    SELECT DISTINCT sts.user_id, ssa.id AS assignment_id
    FROM slot_sa ssa
    JOIN training_slots ts ON ts.id = ssa.training_slot_id
    JOIN swimmer_training_slots sts
      ON  sts.day_of_week = ts.day_of_week
      AND sts.start_time  = ts.start_time
      AND sts.is_active   = true
    JOIN group_members gm ON gm.user_id = sts.user_id AND gm.group_id = ssa.target_group_id
    WHERE ssa.target_group_id IS NOT NULL
  ),
  group_fallback AS (
    SELECT DISTINCT gm.user_id, ssa.id AS assignment_id
    FROM slot_sa ssa
    JOIN group_members gm ON gm.group_id = ssa.target_group_id
    WHERE ssa.target_group_id IS NOT NULL
      AND gm.user_id NOT IN (SELECT user_id FROM swimmers_with_custom_slots)
  ),
  user_direct AS (
    SELECT DISTINCT ssa.target_user_id AS user_id, ssa.id AS assignment_id
    FROM slot_sa ssa
    WHERE ssa.target_user_id IS NOT NULL
  ),
  all_assignments AS (
    SELECT user_id, assignment_id FROM group_custom
    UNION SELECT user_id, assignment_id FROM group_fallback
    UNION SELECT user_id, assignment_id FROM user_direct
  ),
  assigned AS (
    SELECT aa.user_id, COUNT(DISTINCT aa.assignment_id) AS cnt
    FROM all_assignments aa
    JOIN users u ON u.id = aa.user_id AND u.role = 'athlete'
    GROUP BY aa.user_id
  ),
  -- ── TOTAL SLOTS (all expected occurrences, assigned or not) ──────────────
  -- Swimmers WITH custom slots: materialise their active slots × dates
  total_custom_raw AS (
    SELECT DISTINCT sts.user_id, sts.id AS slot_row, d.d
    FROM swimmer_training_slots sts
    JOIN dates d ON d.dow = sts.day_of_week
    WHERE sts.is_active = true
      AND sts.user_id IN (SELECT user_id FROM swimmers_with_custom_slots)
  ),
  total_custom AS (
    SELECT user_id, COUNT(*) AS cnt FROM total_custom_raw GROUP BY user_id
  ),
  -- Swimmers WITHOUT custom slots: group slots × dates
  active_group_slots AS (
    SELECT DISTINCT ts.day_of_week, tsa.group_id
    FROM training_slots ts
    JOIN training_slot_assignments tsa ON tsa.slot_id = ts.id
    WHERE ts.is_active = true
  ),
  total_fallback_raw AS (
    SELECT DISTINCT gm.user_id, ags.day_of_week, ags.group_id, d.d
    FROM active_group_slots ags
    JOIN group_members gm ON gm.group_id = ags.group_id
    JOIN dates d ON d.dow = ags.day_of_week
    WHERE gm.user_id NOT IN (SELECT user_id FROM swimmers_with_custom_slots)
  ),
  total_fallback AS (
    SELECT user_id, COUNT(*) AS cnt FROM total_fallback_raw GROUP BY user_id
  ),
  total_by_user AS (
    SELECT user_id, cnt FROM total_custom
    UNION ALL
    SELECT user_id, cnt FROM total_fallback
  ),
  total_agg AS (
    SELECT user_id, SUM(cnt)::integer AS cnt FROM total_by_user GROUP BY user_id
  ),
  -- ── FEEDBACKS ────────────────────────────────────────────────────────────
  feedbacks AS (
    SELECT ds.athlete_id, COUNT(*) AS cnt
    FROM dim_sessions ds
    WHERE ds.session_date >= (SELECT d FROM since_date)
      AND ds.session_date <  current_date
      AND ds.athlete_id IS NOT NULL
    GROUP BY ds.athlete_id
  )
  -- Drive off total_agg so swimmers with slots but no assignments still appear
  SELECT
    t.user_id::integer                  AS athlete_id,
    COALESCE(a.cnt, 0)::integer         AS assigned_count,
    COALESCE(f.cnt, 0)::integer         AS feedback_count,
    t.cnt::integer                      AS total_slots
  FROM total_agg t
  JOIN users u ON u.id = t.user_id AND u.role = 'athlete'
  LEFT JOIN assigned  a ON a.user_id    = t.user_id
  LEFT JOIN feedbacks f ON f.athlete_id = t.user_id;
$$;
