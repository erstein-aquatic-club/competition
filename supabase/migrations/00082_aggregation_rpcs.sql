-- Migration 00082: Aggregation RPCs
-- Replaces client-side loops with server-side computation

-- RPC: get_strength_run_summary
-- Replaces computeRunTonnage/computeRunTotalReps in strengthHistoryUtils.ts
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
        ORDER BY MIN(s2.set_number)
      ) ex_agg
    )
  )
  INTO v_result
  FROM strength_set_logs ssl
  WHERE ssl.run_id = p_run_id;

  RETURN COALESCE(v_result, '{"tonnage":0,"total_reps":0,"total_sets":0,"avg_difficulty":null,"exercises":[]}'::jsonb);
END;
$$;

-- RPC: batch_upsert_1rm
-- Replaces N parallel update1RM() calls (strength.ts)
CREATE OR REPLACE FUNCTION public.batch_upsert_1rm(p_records jsonb)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF p_records IS NULL OR jsonb_array_length(p_records) = 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO one_rm_records (athlete_id, exercise_id, one_rm, source_run_id, recorded_at, notes)
  SELECT
    (r->>'athlete_id')::int,
    (r->>'exercise_id')::int,
    (r->>'one_rm')::numeric,
    (r->>'source_run_id')::int,
    now(),
    r->>'notes'
  FROM jsonb_array_elements(p_records) AS r
  ON CONFLICT (athlete_id, exercise_id) DO UPDATE SET
    one_rm = EXCLUDED.one_rm,
    source_run_id = EXCLUDED.source_run_id,
    recorded_at = EXCLUDED.recorded_at,
    notes = COALESCE(EXCLUDED.notes, one_rm_records.notes);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
