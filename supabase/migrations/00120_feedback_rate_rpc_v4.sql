-- Migration 00120: Replace get_feedback_rates_all_athletes (v4)
--
-- v3 joined swimmer_training_slots via source_assignment_id. That FK is
-- declared ON DELETE SET NULL: whenever a coach modifies a slot's group
-- assignments (delete + re-insert training_slot_assignments rows), every
-- swimmer_training_slots.source_assignment_id that pointed to the deleted row
-- is set to NULL — silently breaking the join and undercounting assigned
-- sessions.
--
-- v4 matches on the training slot's (day_of_week, start_time) instead.
-- These values are copied verbatim into swimmer_training_slots on init/reset
-- and are stable across TSA recreations. The swimmer must also be a member
-- of the group targeted by the session assignment.

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
  -- Slot-based assignments in the window (not cancelled)
  slot_sa AS (
    SELECT
      sa.id,
      sa.training_slot_id,
      sa.target_group_id,
      sa.target_user_id
    FROM session_assignments sa
    WHERE sa.training_slot_id IS NOT NULL
      AND sa.scheduled_date >= (SELECT d FROM since_date)
      AND sa.scheduled_date <  current_date
      AND sa.status <> 'cancelled'
  ),
  -- Swimmers who have at least one active custom slot
  swimmers_with_custom_slots AS (
    SELECT DISTINCT user_id
    FROM swimmer_training_slots
    WHERE is_active = true
  ),
  -- Group assignments → swimmers WITH custom slots:
  -- Match via the slot's (day_of_week, start_time) — stable even after TSA recreation.
  -- Also require group membership to avoid counting swimmers from other groups
  -- that share the same time slot.
  group_custom AS (
    SELECT DISTINCT
      sts.user_id,
      ssa.id AS assignment_id
    FROM slot_sa ssa
    JOIN training_slots ts ON ts.id = ssa.training_slot_id
    JOIN swimmer_training_slots sts
      ON  sts.day_of_week = ts.day_of_week
      AND sts.start_time  = ts.start_time
      AND sts.is_active   = true
    JOIN group_members gm
      ON  gm.user_id   = sts.user_id
      AND gm.group_id  = ssa.target_group_id
    WHERE ssa.target_group_id IS NOT NULL
  ),
  -- Group assignments → swimmers WITHOUT custom slots (fallback: all members)
  group_fallback AS (
    SELECT DISTINCT
      gm.user_id,
      ssa.id AS assignment_id
    FROM slot_sa ssa
    JOIN group_members gm ON gm.group_id = ssa.target_group_id
    WHERE ssa.target_group_id IS NOT NULL
      AND gm.user_id NOT IN (SELECT user_id FROM swimmers_with_custom_slots)
  ),
  -- Direct (individual) assignments always count
  user_direct AS (
    SELECT DISTINCT
      ssa.target_user_id AS user_id,
      ssa.id             AS assignment_id
    FROM slot_sa ssa
    WHERE ssa.target_user_id IS NOT NULL
  ),
  -- Merge all, keep only athletes
  all_assignments AS (
    SELECT user_id, assignment_id FROM group_custom
    UNION
    SELECT user_id, assignment_id FROM group_fallback
    UNION
    SELECT user_id, assignment_id FROM user_direct
  ),
  assigned AS (
    SELECT aa.user_id, COUNT(DISTINCT aa.assignment_id) AS cnt
    FROM all_assignments aa
    JOIN users u ON u.id = aa.user_id AND u.role = 'athlete'
    GROUP BY aa.user_id
  ),
  -- Feedbacks submitted in the same window
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
