-- Migration 00119: Replace get_feedback_rates_all_athletes (v3)
--
-- v2 expanded group assignments to ALL members of the group, ignoring the
-- per-swimmer slot customisation (swimmer_training_slots).
--
-- v3 uses swimmer_training_slots as the source of truth for "does this
-- swimmer actually attend this slot?":
--
--   • If the swimmer HAS active rows in swimmer_training_slots:
--     only count session_assignments whose training_slot maps through
--     training_slot_assignments.id → swimmer_training_slots.source_assignment_id
--     (i.e. the swimmer has kept that slot active in their schedule).
--
--   • If the swimmer has NO rows in swimmer_training_slots (schedule not yet
--     configured): fall back to counting all group-level assignments so they
--     are not silently excluded from the KPI.

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
  -- only count if swimmer has an active entry for that slot assignment
  group_custom AS (
    SELECT DISTINCT
      sts.user_id,
      ssa.id AS assignment_id
    FROM slot_sa ssa
    JOIN training_slot_assignments tsa
      ON tsa.slot_id    = ssa.training_slot_id
     AND tsa.group_id   = ssa.target_group_id
    JOIN swimmer_training_slots sts
      ON sts.source_assignment_id = tsa.id
     AND sts.is_active = true
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
