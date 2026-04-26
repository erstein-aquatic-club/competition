-- 00146_save_strength_run_assignment_authz.sql
-- §171 audit P0/P1 #5: prevent forged assignment_id in save_strength_run_atomic.
--
-- The SECURITY DEFINER RPC was unconditionally updating session_assignments
-- by id, which (combined with the assignments_write hole pre-§171) allowed a
-- malicious coach to mark another coach's assignment "completed". This patch
-- adds an explicit check: the assignment must target v_target_athlete_id,
-- OR caller is admin.

CREATE OR REPLACE FUNCTION public.save_strength_run_atomic(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id int;
  v_logs_count int;
  v_1rm_count int := 0;
  v_assignment_updated boolean := false;
  v_caller_id int;
  v_caller_role text;
  v_target_athlete_id int;
  v_assignment_id int;
  v_assignment_target int;
BEGIN
  v_caller_id := app_user_id();
  v_caller_role := app_user_role();
  v_target_athlete_id := (p_data->>'athlete_id')::int;

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF v_target_athlete_id IS NULL THEN
    RAISE EXCEPTION 'athlete_id is required' USING ERRCODE = '22023';
  END IF;

  IF v_target_athlete_id <> v_caller_id
     AND v_caller_role NOT IN ('coach', 'admin') THEN
    RAISE EXCEPTION 'forbidden: cannot save run for another athlete' USING ERRCODE = '42501';
  END IF;

  INSERT INTO strength_session_runs (
    session_id, athlete_id, assignment_id, started_at, completed_at,
    status, fatigue, comments
  ) VALUES (
    (p_data->>'session_id')::int,
    v_target_athlete_id,
    NULLIF(p_data->>'assignment_id', '')::int,
    COALESCE((p_data->>'started_at')::timestamptz, now()),
    now(),
    'completed',
    NULLIF(p_data->>'fatigue', '')::int,
    NULLIF(p_data->>'comments', '')
  ) RETURNING id INTO v_run_id;

  INSERT INTO strength_set_logs (
    run_id, exercise_id, set_index, reps, weight, difficulty, completed_at, notes
  )
  SELECT
    v_run_id,
    (log->>'exercise_id')::int,
    COALESCE((log->>'set_index')::int, (log->>'set_number')::int),
    (log->>'reps')::int,
    COALESCE((log->>'weight')::numeric, 0),
    NULLIF(log->>'difficulty', '')::int,
    COALESCE((log->>'completed_at')::timestamptz, now()),
    NULLIF(log->>'notes', '')
  FROM jsonb_array_elements(p_data->'logs') AS log;
  GET DIAGNOSTICS v_logs_count = ROW_COUNT;

  IF p_data->'one_rm_estimates' IS NOT NULL
     AND jsonb_typeof(p_data->'one_rm_estimates') = 'array'
     AND jsonb_array_length(p_data->'one_rm_estimates') > 0
  THEN
    INSERT INTO one_rm_records (athlete_id, exercise_id, one_rm, source_run_id, recorded_at)
    SELECT
      COALESCE(NULLIF(r->>'athlete_id', '')::int, v_target_athlete_id),
      (r->>'exercise_id')::int,
      COALESCE((r->>'weight')::numeric, (r->>'one_rm')::numeric),
      v_run_id,
      now()
    FROM jsonb_array_elements(p_data->'one_rm_estimates') AS r
    WHERE COALESCE((r->>'weight')::numeric, (r->>'one_rm')::numeric) IS NOT NULL
    ON CONFLICT (athlete_id, exercise_id) DO UPDATE SET
      one_rm = EXCLUDED.one_rm,
      source_run_id = EXCLUDED.source_run_id,
      recorded_at = EXCLUDED.recorded_at;
    GET DIAGNOSTICS v_1rm_count = ROW_COUNT;
  END IF;

  -- §171 P0/P1 #5: assignment_id must target this athlete (or caller=admin)
  v_assignment_id := NULLIF(p_data->>'assignment_id', '')::int;
  IF v_assignment_id IS NOT NULL THEN
    SELECT target_user_id INTO v_assignment_target
      FROM session_assignments
     WHERE id = v_assignment_id;

    IF v_assignment_target IS NULL THEN
      -- Group-targeted or unknown: only admin/coach may mark completed
      IF v_caller_role NOT IN ('coach', 'admin') THEN
        RAISE EXCEPTION 'forbidden: cannot mark non-direct assignment completed'
          USING ERRCODE = '42501';
      END IF;
    ELSIF v_assignment_target <> v_target_athlete_id
          AND v_caller_role <> 'admin' THEN
      RAISE EXCEPTION 'forbidden: assignment % does not target athlete %',
        v_assignment_id, v_target_athlete_id USING ERRCODE = '42501';
    END IF;

    UPDATE session_assignments SET status = 'completed'
     WHERE id = v_assignment_id;
    v_assignment_updated := FOUND;
  END IF;

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'logs_count', v_logs_count,
    'one_rm_count', v_1rm_count,
    'assignment_updated', v_assignment_updated
  );
END;
$$;
