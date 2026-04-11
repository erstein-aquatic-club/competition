-- Migration 00083: Atomic save_strength_run
-- Single transaction replacing 5-step saveStrengthRun() in strength.ts
-- If any step fails, full rollback — no partial data

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
BEGIN
  -- Step 1: Insert the run
  INSERT INTO strength_session_runs (
    session_id, athlete_id, assignment_id, started_at, completed_at,
    status, feeling, rpe, duration, comments
  ) VALUES (
    (p_data->>'session_id')::int,
    (p_data->>'athlete_id')::int,
    NULLIF(p_data->>'assignment_id', '')::int,
    COALESCE((p_data->>'started_at')::timestamptz, now()),
    now(),
    'completed',
    NULLIF(p_data->>'feeling', '')::int,
    NULLIF(p_data->>'rpe', '')::int,
    NULLIF(p_data->>'duration', '')::int,
    NULLIF(p_data->>'comments', '')
  )
  RETURNING id INTO v_run_id;

  -- Step 2: Insert all set logs
  INSERT INTO strength_set_logs (
    run_id, exercise_id, set_number, reps, weight, difficulty, completed_at, notes
  )
  SELECT
    v_run_id,
    (log->>'exercise_id')::int,
    (log->>'set_number')::int,
    (log->>'reps')::int,
    COALESCE((log->>'weight')::numeric, 0),
    NULLIF(log->>'difficulty', '')::int,
    COALESCE((log->>'completed_at')::timestamptz, now()),
    NULLIF(log->>'notes', '')
  FROM jsonb_array_elements(p_data->'logs') AS log;

  GET DIAGNOSTICS v_logs_count = ROW_COUNT;

  -- Step 3: Batch upsert 1RM estimates (if any)
  IF p_data->'one_rm_estimates' IS NOT NULL
     AND jsonb_typeof(p_data->'one_rm_estimates') = 'array'
     AND jsonb_array_length(p_data->'one_rm_estimates') > 0
  THEN
    INSERT INTO one_rm_records (athlete_id, exercise_id, one_rm, source_run_id, recorded_at)
    SELECT
      (r->>'athlete_id')::int,
      (r->>'exercise_id')::int,
      (r->>'one_rm')::numeric,
      v_run_id,
      now()
    FROM jsonb_array_elements(p_data->'one_rm_estimates') AS r
    ON CONFLICT (athlete_id, exercise_id) DO UPDATE SET
      one_rm = EXCLUDED.one_rm,
      source_run_id = EXCLUDED.source_run_id,
      recorded_at = EXCLUDED.recorded_at;

    GET DIAGNOSTICS v_1rm_count = ROW_COUNT;
  END IF;

  -- Step 4: Update assignment status if linked
  IF NULLIF(p_data->>'assignment_id', '') IS NOT NULL THEN
    UPDATE session_assignments
    SET status = 'completed'
    WHERE id = (p_data->>'assignment_id')::int;
  END IF;

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'logs_count', v_logs_count,
    'one_rm_count', v_1rm_count
  );
END;
$$;
