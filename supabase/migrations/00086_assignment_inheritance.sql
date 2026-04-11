-- Migration 00086: Assignment inheritance system
-- Enables: slot-based feedback, individual>group priority, sub-group targeting,
-- interviews RLS scoped to assigned coach

-- 1. Link feedback to specific assignments
ALTER TABLE dim_sessions ADD COLUMN IF NOT EXISTS assignment_id INTEGER
  REFERENCES session_assignments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_dim_sessions_assignment ON dim_sessions(assignment_id)
  WHERE assignment_id IS NOT NULL;

-- 2. Replace dedup constraint: allow multiple feedbacks per day if different assignments
-- Old: (athlete_name, session_date, time_slot, duration, rpe) — too restrictive for multi-slot
-- New: one feedback per assignment (when assignment is linked)
-- Legacy data (assignment_id IS NULL) keeps the old dedup via time_slot
DROP INDEX IF EXISTS idx_dim_sessions_dedupe;
CREATE UNIQUE INDEX idx_dim_sessions_dedupe_v2 ON dim_sessions
  (athlete_id, session_date, assignment_id)
  WHERE athlete_id IS NOT NULL AND assignment_id IS NOT NULL;
-- Keep a looser constraint for legacy data without assignment link
CREATE UNIQUE INDEX idx_dim_sessions_dedupe_legacy ON dim_sessions
  (athlete_id, session_date, time_slot)
  WHERE athlete_id IS NOT NULL AND assignment_id IS NULL;

-- 3. Sub-group targeting for slot assignments
ALTER TABLE session_assignments ADD COLUMN IF NOT EXISTS target_subgroup_id INTEGER
  REFERENCES groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sa_subgroup ON session_assignments(target_subgroup_id)
  WHERE target_subgroup_id IS NOT NULL;

-- 4. Fix interviews RLS: scope coach access to their assigned swimmers only
-- (previously all coaches could see/edit all interviews)
DROP POLICY IF EXISTS "interviews_coach_select" ON interviews;
CREATE POLICY "interviews_coach_select" ON interviews FOR SELECT
  USING (
    app_user_role() = 'admin'
    OR (
      app_user_role() = 'coach'
      AND (
        created_by = auth.uid()
        OR athlete_id IN (
          SELECT swimmer_id FROM coach_swimmer_assignments
          WHERE coach_id = app_user_id()
        )
      )
    )
  );

DROP POLICY IF EXISTS "interviews_coach_update" ON interviews;
CREATE POLICY "interviews_coach_update" ON interviews FOR UPDATE
  USING (
    app_user_role() = 'admin'
    OR (
      app_user_role() = 'coach'
      AND (
        created_by = auth.uid()
        OR athlete_id IN (
          SELECT swimmer_id FROM coach_swimmer_assignments
          WHERE coach_id = app_user_id()
        )
      )
    )
  );

DROP POLICY IF EXISTS "interviews_coach_delete" ON interviews;
CREATE POLICY "interviews_coach_delete" ON interviews FOR DELETE
  USING (
    app_user_role() = 'admin'
    OR (
      app_user_role() = 'coach'
      AND created_by = auth.uid()
    )
  );

-- 5. Fix save_strength_run_atomic: warn if assignment was deleted
CREATE OR REPLACE FUNCTION public.save_strength_run_atomic(p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run_id int;
  v_logs_count int;
  v_1rm_count int := 0;
  v_assignment_updated boolean := false;
BEGIN
  INSERT INTO strength_session_runs (
    session_id, athlete_id, assignment_id, started_at, completed_at,
    status, feeling, rpe, duration, comments
  ) VALUES (
    (p_data->>'session_id')::int, (p_data->>'athlete_id')::int,
    NULLIF(p_data->>'assignment_id', '')::int,
    COALESCE((p_data->>'started_at')::timestamptz, now()), now(),
    'completed', NULLIF(p_data->>'feeling', '')::int,
    NULLIF(p_data->>'rpe', '')::int, NULLIF(p_data->>'duration', '')::int,
    NULLIF(p_data->>'comments', '')
  ) RETURNING id INTO v_run_id;

  INSERT INTO strength_set_logs (run_id, exercise_id, set_number, reps, weight, difficulty, completed_at, notes)
  SELECT v_run_id, (log->>'exercise_id')::int, (log->>'set_number')::int,
    (log->>'reps')::int, COALESCE((log->>'weight')::numeric, 0),
    NULLIF(log->>'difficulty', '')::int,
    COALESCE((log->>'completed_at')::timestamptz, now()), NULLIF(log->>'notes', '')
  FROM jsonb_array_elements(p_data->'logs') AS log;
  GET DIAGNOSTICS v_logs_count = ROW_COUNT;

  IF p_data->'one_rm_estimates' IS NOT NULL
     AND jsonb_typeof(p_data->'one_rm_estimates') = 'array'
     AND jsonb_array_length(p_data->'one_rm_estimates') > 0
  THEN
    INSERT INTO one_rm_records (athlete_id, exercise_id, one_rm, source_run_id, recorded_at)
    SELECT (r->>'athlete_id')::int, (r->>'exercise_id')::int,
      (r->>'one_rm')::numeric, v_run_id, now()
    FROM jsonb_array_elements(p_data->'one_rm_estimates') AS r
    ON CONFLICT (athlete_id, exercise_id) DO UPDATE SET
      one_rm = EXCLUDED.one_rm, source_run_id = EXCLUDED.source_run_id,
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
END; $$;
