-- Migration 00137: Atomic log_strength_set
--
-- Motivation:
-- Previously, logging a strength set from the client did two separate writes
-- (strength_set_logs INSERT, then optionally one_rm_records UPSERT). A failure
-- on the 2nd write left torn state (set saved but 1RM stale) and the caller
-- could not distinguish the partial-success case from total failure.
--
-- This RPC performs both writes inside a single transaction — if the 1RM
-- upsert fails the set insert is rolled back, keeping user state consistent.
--
-- Authorization:
-- - SECURITY DEFINER so we can write to RLS-protected tables after explicit
--   authz check inside the function.
-- - The caller must either own p_user_id (app_user_id() = p_user_id) or be a
--   coach/admin. We DO NOT use auth.uid() directly — project convention is to
--   resolve the app user id via the app_user_id() helper.

CREATE OR REPLACE FUNCTION public.log_strength_set_atomic(
  p_user_id bigint,
  p_exercise_id bigint,
  p_reps int,
  p_weight numeric,
  p_run_id bigint,
  p_completed_at timestamptz,
  p_set_index int DEFAULT NULL,
  p_difficulty int DEFAULT NULL,
  p_rpe int DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_rest_seconds int DEFAULT NULL,
  p_pct_1rm_suggested numeric DEFAULT NULL,
  p_one_rm_estimate numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id integer;
  v_caller_role text;
  v_set_id integer;
  v_existing_1rm numeric;
  v_updated_1rm numeric := NULL;
BEGIN
  -- Authz: caller must be the athlete OR a coach/admin.
  v_caller_id := app_user_id();
  v_caller_role := app_user_role();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF v_caller_id <> p_user_id::integer
     AND COALESCE(v_caller_role, '') NOT IN ('coach', 'admin') THEN
    RAISE EXCEPTION 'forbidden: user % cannot log sets for user %',
      v_caller_id, p_user_id USING ERRCODE = '42501';
  END IF;

  -- 1) Insert the set log.
  INSERT INTO strength_set_logs (
    run_id,
    exercise_id,
    set_index,
    reps,
    weight,
    difficulty,
    rpe,
    notes,
    rest_seconds,
    pct_1rm_suggested,
    completed_at
  ) VALUES (
    p_run_id::integer,
    p_exercise_id::integer,
    p_set_index,
    p_reps,
    p_weight,
    p_difficulty,
    p_rpe,
    p_notes,
    p_rest_seconds,
    p_pct_1rm_suggested,
    COALESCE(p_completed_at, now())
  )
  RETURNING id INTO v_set_id;

  -- 2) Upsert the 1RM estimate if caller provided one and it's a new PR.
  --    Bodyweight / nonsensical reps are filtered client-side.
  IF p_one_rm_estimate IS NOT NULL AND p_one_rm_estimate > 0 THEN
    SELECT one_rm INTO v_existing_1rm
    FROM one_rm_records
    WHERE athlete_id = p_user_id::integer
      AND exercise_id = p_exercise_id::integer;

    IF v_existing_1rm IS NULL OR p_one_rm_estimate > v_existing_1rm THEN
      INSERT INTO one_rm_records (
        athlete_id,
        exercise_id,
        one_rm,
        source_run_id,
        recorded_at
      ) VALUES (
        p_user_id::integer,
        p_exercise_id::integer,
        p_one_rm_estimate,
        p_run_id::integer,
        now()
      )
      ON CONFLICT (athlete_id, exercise_id) DO UPDATE SET
        one_rm = EXCLUDED.one_rm,
        source_run_id = EXCLUDED.source_run_id,
        recorded_at = EXCLUDED.recorded_at;

      v_updated_1rm := p_one_rm_estimate;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'set_id', v_set_id,
    'one_rm_updated', v_updated_1rm IS NOT NULL,
    'one_rm', v_updated_1rm
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_strength_set_atomic(
  bigint, bigint, int, numeric, bigint, timestamptz,
  int, int, int, text, int, numeric, numeric
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.log_strength_set_atomic(
  bigint, bigint, int, numeric, bigint, timestamptz,
  int, int, int, text, int, numeric, numeric
) TO authenticated;

COMMENT ON FUNCTION public.log_strength_set_atomic(
  bigint, bigint, int, numeric, bigint, timestamptz,
  int, int, int, text, int, numeric, numeric
) IS
  'Atomically logs a strength set and updates the athlete 1RM in a single transaction. '
  'Used by logStrengthSet / reconcileStrengthRunLogs to avoid torn state on partial failures.';
