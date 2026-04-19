-- Canonical resolver for what a swimmer should see on a given date range.
-- Consumed by Dashboard, coach week view (swimmer filter), Suivi*, SwimmerHome.
-- See docs/plans/2026-04-19-swimmer-inheritance-unification-design.md

CREATE OR REPLACE FUNCTION public.get_swimmer_sessions(
  p_user_id integer,
  p_from date,
  p_to date,
  p_include_drafts boolean DEFAULT false
)
RETURNS TABLE (
  swimmer_slot_id uuid,
  scheduled_date date,
  day_of_week int,
  bucket text,
  slot_start_time time,
  slot_end_time time,
  slot_location text,
  slot_session_type text,
  assignment_id integer,
  assignment_source text,
  assignment_title text,
  assignment_total_km numeric,
  swim_catalog_id integer,
  strength_session_id integer,
  training_slot_id uuid,
  is_absent boolean,
  absence_reason text,
  log_session_id uuid
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
AS $$
DECLARE
  v_has_custom boolean;
  v_group_ids int[];
BEGIN
  -- Swimmer's current group memberships (permanent + active temporary)
  SELECT array_agg(DISTINCT gm.group_id)
  INTO v_group_ids
  FROM group_members gm
  JOIN groups g ON g.id = gm.group_id
  WHERE gm.user_id = p_user_id
    AND (NOT g.is_temporary OR g.is_active);

  -- Does swimmer have custom slots?
  SELECT EXISTS(
    SELECT 1 FROM swimmer_training_slots
    WHERE user_id = p_user_id AND is_active = true
  ) INTO v_has_custom;

  RETURN QUERY
  WITH
  -- Step 1: expected slots (from swimmer_training_slots if custom, else group training_slots)
  date_series AS (
    SELECT d::date AS sched_date,
           EXTRACT(ISODOW FROM d)::int AS dow
    FROM generate_series(p_from, p_to, '1 day') d
  ),
  expected_slots AS (
    SELECT
      CASE WHEN v_has_custom THEN sts.id ELSE NULL END AS swimmer_slot_id,
      ds.sched_date,
      ds.dow,
      CASE WHEN EXTRACT(HOUR FROM COALESCE(sts.start_time, ts.start_time)) < 13
           THEN 'morning' ELSE 'evening' END AS bucket,
      COALESCE(sts.start_time, ts.start_time) AS slot_start_time,
      COALESCE(sts.end_time, ts.end_time) AS slot_end_time,
      COALESCE(sts.location, ts.location) AS slot_location,
      COALESCE(sts.session_type, ts.session_type) AS slot_session_type,
      sts.source_assignment_id,
      ts.id AS direct_training_slot_id  -- NULL if came from swimmer_slot path
    FROM date_series ds
    LEFT JOIN swimmer_training_slots sts
      ON v_has_custom
     AND sts.user_id = p_user_id
     AND sts.is_active = true
     AND sts.day_of_week = ds.dow
    LEFT JOIN training_slots ts
      ON (NOT v_has_custom)
     AND ts.is_active = true
     AND ts.day_of_week = ds.dow
     AND EXISTS(
       SELECT 1 FROM training_slot_assignments tsa
       WHERE tsa.slot_id = ts.id AND tsa.group_id = ANY(v_group_ids)
     )
    WHERE (v_has_custom AND sts.id IS NOT NULL)
       OR (NOT v_has_custom AND ts.id IS NOT NULL)
  ),
  -- Step 2: resolve training_slot_id source per expected slot
  with_source AS (
    SELECT
      es.*,
      COALESCE(
        -- Exact match via source_assignment_id
        (SELECT tsa.slot_id FROM training_slot_assignments tsa
         WHERE tsa.id = es.source_assignment_id LIMIT 1),
        -- Fallback by attributes (day + session_type + bucket + group match)
        (SELECT ts.id FROM training_slots ts
         JOIN training_slot_assignments tsa ON tsa.slot_id = ts.id
         WHERE ts.is_active = true
           AND ts.day_of_week = es.dow
           AND ts.session_type = es.slot_session_type
           AND CASE WHEN EXTRACT(HOUR FROM ts.start_time) < 13 THEN 'morning' ELSE 'evening' END = es.bucket
           AND tsa.group_id = ANY(v_group_ids)
         ORDER BY ABS(EXTRACT(EPOCH FROM (ts.start_time - es.slot_start_time))) ASC
         LIMIT 1),
        -- If expected_slots.direct_training_slot_id is set (no custom path), keep it
        es.direct_training_slot_id
      ) AS resolved_training_slot_id
    FROM expected_slots es
  ),
  -- Step 3: find the best assignment per expected slot (individual > subgroup > group)
  candidate_assignments AS (
    SELECT
      ws.swimmer_slot_id,
      ws.sched_date,
      ws.dow,
      ws.bucket,
      ws.slot_start_time,
      ws.slot_end_time,
      ws.slot_location,
      ws.slot_session_type,
      ws.resolved_training_slot_id,
      sa.id AS assignment_id,
      CASE
        WHEN sa.target_user_id = p_user_id THEN 'individual'
        WHEN sa.target_subgroup_id = ANY(v_group_ids) THEN 'subgroup'
        WHEN sa.target_group_id = ANY(v_group_ids) THEN 'group'
        ELSE 'none'
      END AS source,
      CASE
        WHEN sa.target_user_id = p_user_id THEN 1
        WHEN sa.target_subgroup_id = ANY(v_group_ids) THEN 2
        WHEN sa.target_group_id = ANY(v_group_ids) THEN 3
        ELSE 4
      END AS priority,
      sa.swim_catalog_id,
      sa.strength_session_id,
      sa.training_slot_id AS sa_training_slot_id,
      COALESCE(ssc.name, 'Séance') AS title,
      ssc.total_distance::numeric AS total_km
    FROM with_source ws
    LEFT JOIN session_assignments sa
      ON sa.scheduled_date = ws.sched_date
     AND sa.status != 'cancelled'
     AND (p_include_drafts OR sa.visible_from IS NULL OR sa.visible_from <= CURRENT_DATE)
     AND (
       sa.target_user_id = p_user_id
       OR (sa.training_slot_id = ws.resolved_training_slot_id AND (sa.target_group_id = ANY(v_group_ids) OR sa.target_subgroup_id = ANY(v_group_ids)))
       OR (sa.training_slot_id IS NULL AND sa.scheduled_slot = ws.bucket AND (sa.target_group_id = ANY(v_group_ids) OR sa.target_subgroup_id = ANY(v_group_ids)))
     )
    LEFT JOIN swim_sessions_catalog ssc ON ssc.id = sa.swim_catalog_id
  ),
  best_assignment AS (
    SELECT DISTINCT ON (ca.swimmer_slot_id, ca.sched_date, ca.bucket)
      ca.*
    FROM candidate_assignments ca
    ORDER BY ca.swimmer_slot_id, ca.sched_date, ca.bucket, ca.priority ASC, ca.assignment_id DESC
  )
  SELECT
    ba.swimmer_slot_id,
    ba.sched_date AS scheduled_date,
    ba.dow AS day_of_week,
    ba.bucket,
    ba.slot_start_time,
    ba.slot_end_time,
    ba.slot_location,
    ba.slot_session_type,
    ba.assignment_id,
    ba.source AS assignment_source,
    ba.title AS assignment_title,
    ba.total_km AS assignment_total_km,
    ba.swim_catalog_id,
    ba.strength_session_id,
    ba.sa_training_slot_id AS training_slot_id,
    EXISTS(
      SELECT 1 FROM planned_absences pa
      WHERE pa.user_id = p_user_id
        AND pa.date = ba.sched_date
        AND (pa.scheduled_slot IS NULL OR pa.scheduled_slot = ba.bucket)
    ) AS is_absent,
    (SELECT pa.reason FROM planned_absences pa
     WHERE pa.user_id = p_user_id
       AND pa.date = ba.sched_date
       AND (pa.scheduled_slot IS NULL OR pa.scheduled_slot = ba.bucket)
     LIMIT 1) AS absence_reason,
    NULL::uuid AS log_session_id  -- populated by later join; stub for now
  FROM best_assignment ba
  ORDER BY ba.sched_date, ba.slot_start_time;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_swimmer_sessions(integer, date, date, boolean) TO authenticated;

COMMENT ON FUNCTION public.get_swimmer_sessions IS
  'Canonical resolver: expected slots + assignments (individual > subgroup > group) + absence status. See design doc 2026-04-19.';
