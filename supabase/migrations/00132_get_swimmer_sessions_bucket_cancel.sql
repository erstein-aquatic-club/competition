-- §149: propagate bucket-level swim slot cancellations to swimmer custom slots.
--
-- Rule (validated by user, 2026-04-19):
--   Si le coach annule toutes les séances natation du groupe sur un bucket
--   (morning/evening) à une date donnée, les créneaux personnalisés des
--   nageurs de ce groupe sur ce bucket sont aussi annulés (filtrés).
--   S'il reste ≥1 slot swim groupe non-annulé sur ce bucket/date, les slots
--   personnalisés sont maintenus. Invariant: 1 seul slot swim/bucket/groupe
--   (donc la cascade est non-ambiguë en pratique).
--
-- Also handles non-custom path: for swimmers without swimmer_training_slots,
-- filter out any training_slot directly cancelled on the date.
--
-- Strength slots: pas de cascade — un slot perso strength reste indépendant
-- du slot swim du groupe.

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
  SELECT array_agg(DISTINCT gm.group_id)
  INTO v_group_ids
  FROM group_members gm
  JOIN groups g ON g.id = gm.group_id
  WHERE gm.user_id = p_user_id
    AND (NOT g.is_temporary OR g.is_active);

  SELECT EXISTS(
    SELECT 1 FROM swimmer_training_slots
    WHERE user_id = p_user_id AND is_active = true
  ) INTO v_has_custom;

  RETURN QUERY
  WITH
  date_series AS (
    SELECT d::date AS sched_date,
           EXTRACT(ISODOW FROM d)::int AS dow
    FROM generate_series(p_from, p_to, '1 day') d
  ),
  -- All directly cancelled (slot_id, date) pairs in the window (any session_type)
  cancelled_slots AS (
    SELECT tso.slot_id, tso.override_date AS sched_date
    FROM training_slot_overrides tso
    WHERE tso.status = 'cancelled'
      AND tso.override_date BETWEEN p_from AND p_to
  ),
  -- Group swim slots × date occurrences (recurring + one-off) with cancellation flag
  group_swim_on_date AS (
    SELECT ds.sched_date, ts.id AS slot_id,
           CASE WHEN EXTRACT(HOUR FROM ts.start_time) < 13 THEN 'morning' ELSE 'evening' END AS bucket,
           EXISTS (SELECT 1 FROM cancelled_slots cs
                   WHERE cs.slot_id = ts.id AND cs.sched_date = ds.sched_date) AS is_cancelled
    FROM date_series ds
    JOIN training_slots ts ON ts.is_active = true
                          AND ts.session_type = 'swim'
                          AND ts.scheduled_date IS NULL
                          AND ts.day_of_week = ds.dow
    JOIN training_slot_assignments tsa ON tsa.slot_id = ts.id
                                      AND tsa.group_id = ANY(v_group_ids)
    UNION ALL
    SELECT ts.scheduled_date AS sched_date, ts.id AS slot_id,
           CASE WHEN EXTRACT(HOUR FROM ts.start_time) < 13 THEN 'morning' ELSE 'evening' END AS bucket,
           false AS is_cancelled  -- One-off active slots contribute presence (never "cancelled" via override path)
    FROM training_slots ts
    JOIN training_slot_assignments tsa ON tsa.slot_id = ts.id
                                      AND tsa.group_id = ANY(v_group_ids)
    WHERE ts.is_active = true
      AND ts.session_type = 'swim'
      AND ts.scheduled_date IS NOT NULL
      AND ts.scheduled_date BETWEEN p_from AND p_to
  ),
  -- Buckets where ALL group swim slots are cancelled on that date (non-empty set)
  cancelled_buckets AS (
    SELECT sched_date, bucket
    FROM group_swim_on_date
    GROUP BY sched_date, bucket
    HAVING bool_and(is_cancelled) = true
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
      ts.id AS direct_training_slot_id
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
  -- Apply cancellations: bucket cascade for custom swim / direct match for non-custom
  effective_expected_slots AS (
    SELECT es.*
    FROM expected_slots es
    WHERE NOT (
      -- Custom path: swim slot cancelled via bucket cascade
      v_has_custom
      AND es.slot_session_type = 'swim'
      AND EXISTS (
        SELECT 1 FROM cancelled_buckets cb
        WHERE cb.sched_date = es.sched_date AND cb.bucket = es.bucket
      )
    )
    AND NOT (
      -- Non-custom path: training_slot directly cancelled on date
      (NOT v_has_custom)
      AND es.direct_training_slot_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM cancelled_slots cs
        WHERE cs.slot_id = es.direct_training_slot_id AND cs.sched_date = es.sched_date
      )
    )
  ),
  with_source AS (
    SELECT
      es.*,
      COALESCE(
        (SELECT tsa.slot_id FROM training_slot_assignments tsa
         WHERE tsa.id = es.source_assignment_id LIMIT 1),
        (SELECT ts.id FROM training_slots ts
         JOIN training_slot_assignments tsa ON tsa.slot_id = ts.id
         WHERE ts.is_active = true
           AND ts.day_of_week = es.dow
           AND ts.session_type = es.slot_session_type
           AND CASE WHEN EXTRACT(HOUR FROM ts.start_time) < 13 THEN 'morning' ELSE 'evening' END = es.bucket
           AND tsa.group_id = ANY(v_group_ids)
         ORDER BY ABS(EXTRACT(EPOCH FROM (ts.start_time - es.slot_start_time))) ASC
         LIMIT 1),
        es.direct_training_slot_id
      ) AS resolved_training_slot_id
    FROM effective_expected_slots es
  ),
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
    NULL::uuid AS log_session_id
  FROM best_assignment ba
  ORDER BY ba.sched_date, ba.slot_start_time;
END;
$$;

COMMENT ON FUNCTION public.get_swimmer_sessions IS
  'Canonical resolver: expected slots + assignments + absences. §149: cancelled swim slots filter out custom slots in same bucket (all-or-nothing) and direct slots on non-custom path.';
