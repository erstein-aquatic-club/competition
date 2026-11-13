-- P0 Focus musculation: prevent duplicate completed runs if an offline
-- save succeeded but its HTTP acknowledgement was lost before queue removal.
-- Deploy this migration BEFORE the PWA bundle that calls the new RPC.
ALTER TABLE public.strength_session_runs
  ADD COLUMN IF NOT EXISTS client_dedup_key text;

CREATE UNIQUE INDEX IF NOT EXISTS strength_session_runs_offline_dedup_idx
  ON public.strength_session_runs (athlete_id, client_dedup_key)
  WHERE client_dedup_key IS NOT NULL;

-- Wrapper rather than replacing save_strength_run_atomic: reuse its existing
-- athlete/assignment authorization, logs and 1RM transaction logic unchanged.
-- The advisory transaction lock serializes concurrent retries of the same key
-- before the row exists; the unique index is the final database guarantee.
CREATE OR REPLACE FUNCTION public.save_strength_run_offline_idempotent(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := NULLIF(TRIM(p_data->>'client_dedup_key'), '');
  v_target_athlete int := NULLIF(p_data->>'athlete_id', '')::int;
  v_caller_id int;
  v_caller_role text;
  v_existing_run int;
  v_result jsonb;
BEGIN
  v_caller_id := public.app_user_id();
  v_caller_role := public.app_user_role();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_target_athlete IS NULL OR
     (v_target_athlete <> v_caller_id
      AND COALESCE(v_caller_role, '') NOT IN ('coach', 'admin')) THEN
    RAISE EXCEPTION 'forbidden: cannot save run for another athlete'
      USING ERRCODE = '42501';
  END IF;
  IF v_key IS NULL OR length(v_key) > 150 THEN
    RAISE EXCEPTION 'invalid strength run deduplication key'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_key, 0));

  SELECT id INTO v_existing_run
    FROM public.strength_session_runs
    WHERE athlete_id = v_target_athlete
      AND client_dedup_key = v_key
    LIMIT 1;
  IF v_existing_run IS NOT NULL THEN
    RETURN jsonb_build_object(
      'run_id', v_existing_run,
      'deduplicated', true
    );
  END IF;

  v_result := public.save_strength_run_atomic(p_data);
  UPDATE public.strength_session_runs
     SET client_dedup_key = v_key
   WHERE id = (v_result->>'run_id')::int
     AND athlete_id = v_target_athlete;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'offline run deduplication could not be committed';
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.save_strength_run_offline_idempotent(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_strength_run_offline_idempotent(jsonb) TO authenticated;

COMMENT ON FUNCTION public.save_strength_run_offline_idempotent(jsonb) IS
  'Idempotent wrapper of save_strength_run_atomic for offline-created strength runs. Same client_dedup_key and athlete always resolves to one run.';
