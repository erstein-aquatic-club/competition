-- §262 — Atomic RPC: save a complete swim session + its exercise logs in one transaction.
--
-- Replaces the legacy N+1 sequence (ensureSwimSession + saveSwimExerciseLogs):
--   1. SELECT dim_sessions WHERE athlete_id=$1 AND session_date=$2 AND time_slot=$3
--   2. INSERT dim_sessions if missing
--   3. DELETE swim_exercise_logs WHERE session_id=$id AND user_id=auth.uid()
--   4. INSERT N rows in swim_exercise_logs (one per bloc)
--
-- Becomes 1 round-trip. Atomic transaction guarantees no orphan session if the
-- network dies mid-flight. Maps naturally onto the §251 `tryWithOfflineQueue`
-- pattern (1 enqueue, 1 replay).
--
-- SECURITY INVOKER: RLS policies on dim_sessions + swim_exercise_logs still
-- apply (athlete owns own data, coach/admin can edit all). No privilege
-- elevation needed.
--
-- Numbered after 00158_get_user_auth_context_rpc.sql (§247).

CREATE OR REPLACE FUNCTION public.save_swim_session_atomic(
  p_date date,
  p_slot text,
  p_logs jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_athlete_id bigint;
  v_user_uuid uuid;
  v_athlete_name text;
  v_session_id bigint;
BEGIN
  v_athlete_id := app_user_id();
  v_user_uuid := auth.uid();

  IF v_athlete_id IS NULL OR v_user_uuid IS NULL THEN
    RAISE EXCEPTION 'save_swim_session_atomic: unauthorized (no app_user_id or auth.uid)';
  END IF;

  -- Find existing session for (athlete_id, date, slot).
  SELECT id INTO v_session_id
  FROM public.dim_sessions
  WHERE athlete_id = v_athlete_id
    AND session_date = p_date
    AND time_slot = p_slot
  LIMIT 1;

  -- Create one if missing — mirrors the legacy ensureSwimSession defaults.
  IF v_session_id IS NULL THEN
    SELECT display_name INTO v_athlete_name
    FROM public.users
    WHERE id = v_athlete_id;

    INSERT INTO public.dim_sessions (
      athlete_id, athlete_name, session_date, time_slot,
      distance, duration, rpe, performance, engagement, fatigue
    )
    VALUES (
      v_athlete_id, COALESCE(v_athlete_name, ''), p_date, p_slot,
      0, 0, 10, 10, 10, 10
    )
    RETURNING id INTO v_session_id;
  END IF;

  -- Delete the user's prior logs for this session (idempotent replay-safe).
  DELETE FROM public.swim_exercise_logs
  WHERE session_id = v_session_id
    AND user_id = v_user_uuid;

  -- Insert the new logs.
  IF p_logs IS NOT NULL AND jsonb_array_length(p_logs) > 0 THEN
    INSERT INTO public.swim_exercise_logs (
      session_id, user_id, exercise_label, source_item_id,
      split_times, tempo, stroke_count, notes,
      event_code, pool_length, equipment
    )
    SELECT
      v_session_id,
      v_user_uuid,
      (log->>'exercise_label')::text,
      NULLIF(log->>'source_item_id', '')::integer,
      COALESCE(log->'split_times', '[]'::jsonb),
      NULLIF(log->>'tempo', '')::numeric,
      COALESCE(log->'stroke_count', '[]'::jsonb),
      NULLIF(log->>'notes', ''),
      NULLIF(log->>'event_code', ''),
      NULLIF(log->>'pool_length', '')::integer,
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(log->'equipment', '["aucun"]'::jsonb))),
        ARRAY['aucun']::text[]
      )
    FROM jsonb_array_elements(p_logs) AS log;
  END IF;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_swim_session_atomic(date, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.save_swim_session_atomic(date, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.save_swim_session_atomic(date, text, jsonb) IS
  '§262 — Atomic save of a swim session + its exercise logs. Returns dim_sessions.id. SECURITY INVOKER, RLS preserved.';
