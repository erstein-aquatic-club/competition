-- Migration 00117: RPC get_feedback_rates_all_athletes
-- Returns, for each swimmer, the number of past training-slot instances
-- (assigned_count) and the number of feedbacks actually submitted
-- (feedback_count) over the last N days.
--
-- Logic:
--   assigned_count = distinct (slot_id × past_date) pairs where the slot's
--                    day_of_week matches the date and the swimmer belongs to a
--                    group assigned to that slot.
--   feedback_count = dim_sessions rows for the swimmer in the same window.

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
  -- All past dates in the window [since, yesterday] with ISO day-of-week (1=Mon … 7=Sun)
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
  -- Active training slots with their group assignments
  slot_groups AS (
    SELECT
      ts.id          AS slot_id,
      ts.day_of_week,
      tsa.group_id
    FROM training_slots ts
    JOIN training_slot_assignments tsa ON tsa.slot_id = ts.id
    WHERE ts.is_active = true
  ),
  -- Current group membership for each swimmer
  swimmer_groups AS (
    SELECT DISTINCT
      gm.user_id,
      gm.group_id
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE u.role = 'athlete'
  ),
  -- Distinct (swimmer, slot, date) triples that fall in range
  slot_instances AS (
    SELECT DISTINCT
      sg.user_id,
      sl.slot_id,
      d.d
    FROM swimmer_groups sg
    JOIN slot_groups sl ON sl.group_id = sg.group_id
    JOIN dates d      ON d.dow = sl.day_of_week
  ),
  -- Aggregate: how many slot instances per swimmer
  assigned AS (
    SELECT user_id, COUNT(*) AS cnt
    FROM slot_instances
    GROUP BY user_id
  ),
  -- Feedbacks submitted per swimmer in the same window
  feedbacks AS (
    SELECT
      ds.athlete_id,
      COUNT(*) AS cnt
    FROM dim_sessions ds
    WHERE ds.session_date >= (SELECT d FROM since_date)
      AND ds.session_date < current_date
      AND ds.athlete_id IS NOT NULL
    GROUP BY ds.athlete_id
  )
  SELECT
    a.user_id::integer           AS athlete_id,
    a.cnt::integer               AS assigned_count,
    COALESCE(f.cnt, 0)::integer  AS feedback_count
  FROM assigned a
  LEFT JOIN feedbacks f ON f.athlete_id = a.user_id;
$$;
