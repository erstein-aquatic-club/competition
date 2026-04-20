-- Migration 00138: Fix save_strength_run_atomic and get_strength_run_summary column references
--
-- Root cause: migrations 00082, 00083, 00086 referenced column `set_number` which has
-- never existed — the actual column is `set_index` (cf. 00001_initial_schema.sql:328).
-- Result: save_strength_run_atomic threw on INSERT, client threw, runs never marked
-- completed (22 set_logs vs 0 completed runs in last 7 days before this patch).
--
-- Fixes:
--   1. save_strength_run_atomic: INSERT into `set_index` (not `set_number`), read
--      `log->>'set_index'` with fallback to `log->>'set_number'` for belt-and-suspenders.
--   2. save_strength_run_atomic: read `r->>'weight'` for 1RM (client sends `weight`,
--      matches batch_upsert_1rm's callsite contract) with fallback to legacy `one_rm`.
--   3. save_strength_run_atomic: add authz — athlete_id must equal caller, unless
--      caller is coach or admin (consistent with §158 security pattern).
--   4. get_strength_run_summary: ORDER BY MIN(s2.set_index).

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
    status, feeling, rpe, duration, comments
  ) VALUES (
    (p_data->>'session_id')::int,
    v_target_athlete_id,
    NULLIF(p_data->>'assignment_id', '')::int,
    COALESCE((p_data->>'started_at')::timestamptz, now()),
    now(),
    'completed',
    NULLIF(p_data->>'feeling', '')::int,
    NULLIF(p_data->>'rpe', '')::int,
    NULLIF(p_data->>'duration', '')::int,
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

  IF NULLIF(p_data->>'assignment_id', '') IS NOT NULL THEN
    UPDATE session_assignments SET status = 'completed'
    WHERE id = (p_data->>'assignment_id')::int;
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

-- Fix get_strength_run_summary aggregation RPC (00082)
CREATE OR REPLACE FUNCTION public.get_strength_run_summary(p_run_id int)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'tonnage', COALESCE(SUM(CASE WHEN ssl.weight > 0 THEN ssl.weight * ssl.reps ELSE 0 END), 0),
    'total_reps', COALESCE(SUM(ssl.reps), 0),
    'total_sets', count(*),
    'avg_difficulty', ROUND(AVG(ssl.difficulty)::numeric, 1),
    'exercises', (
      SELECT COALESCE(jsonb_agg(ex_summary), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'exercise_id', s2.exercise_id,
          'exercise_name', de.nom_exercice,
          'sets', count(*),
          'total_reps', COALESCE(SUM(s2.reps), 0),
          'tonnage', COALESCE(SUM(CASE WHEN s2.weight > 0 THEN s2.weight * s2.reps ELSE 0 END), 0),
          'avg_difficulty', ROUND(AVG(s2.difficulty)::numeric, 1)
        ) AS ex_summary
        FROM strength_set_logs s2
        LEFT JOIN dim_exercices de ON de.id = s2.exercise_id
        WHERE s2.run_id = p_run_id
        GROUP BY s2.exercise_id, de.nom_exercice
        ORDER BY MIN(s2.set_index)
      ) ex_agg
    )
  )
  INTO v_result
  FROM strength_set_logs ssl
  WHERE ssl.run_id = p_run_id;

  RETURN COALESCE(v_result, '{"tonnage":0,"total_reps":0,"total_sets":0,"avg_difficulty":null,"exercises":[]}'::jsonb);
END;
$$;
