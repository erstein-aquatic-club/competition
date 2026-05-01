-- §184 — RPC upsert_pace_target
-- Needed because supabase-js onConflict passes index names as column names → 400
-- on partial unique indexes (WHERE swimmer_account_id IS NOT NULL).
-- The RPC can express ON CONFLICT (...) WHERE predicate directly in SQL.
CREATE OR REPLACE FUNCTION upsert_pace_target(
  p_stroke             text,
  p_distance_m         int,
  p_time_ms            int,
  p_swimmer_account_id bigint  DEFAULT NULL,
  p_swimmer_manual_id  uuid    DEFAULT NULL
)
RETURNS coach_pace_targets
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach_id uuid;
  v_result   coach_pace_targets;
BEGIN
  v_coach_id := auth.uid();
  IF v_coach_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;

  IF p_swimmer_account_id IS NOT NULL THEN
    INSERT INTO coach_pace_targets (
      coach_id, swimmer_account_id, swimmer_manual_id,
      stroke, target_distance_m, target_time_ms, updated_at
    ) VALUES (
      v_coach_id, p_swimmer_account_id, NULL,
      p_stroke, p_distance_m, p_time_ms, now()
    )
    ON CONFLICT (coach_id, swimmer_account_id, stroke, target_distance_m)
    WHERE swimmer_account_id IS NOT NULL
    DO UPDATE SET
      target_time_ms = EXCLUDED.target_time_ms,
      updated_at     = now()
    RETURNING * INTO v_result;
  ELSE
    IF p_swimmer_manual_id IS NULL THEN
      RAISE EXCEPTION 'swimmer_ref_required' USING ERRCODE = 'P0002';
    END IF;
    INSERT INTO coach_pace_targets (
      coach_id, swimmer_account_id, swimmer_manual_id,
      stroke, target_distance_m, target_time_ms, updated_at
    ) VALUES (
      v_coach_id, NULL, p_swimmer_manual_id,
      p_stroke, p_distance_m, p_time_ms, now()
    )
    ON CONFLICT (coach_id, swimmer_manual_id, stroke, target_distance_m)
    WHERE swimmer_manual_id IS NOT NULL
    DO UPDATE SET
      target_time_ms = EXCLUDED.target_time_ms,
      updated_at     = now()
    RETURNING * INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_pace_target(text, int, int, bigint, uuid) TO authenticated;
