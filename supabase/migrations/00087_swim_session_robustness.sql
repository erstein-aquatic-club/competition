-- Migration 00087: Swim session robustness
-- Fixes: atomic session update, assignment dedup constraint, delete protection, notification

-- 1. UNIQUE constraint to prevent duplicate slot assignments
-- Partial unique: only for non-cancelled assignments with a training_slot_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_sa_unique_slot_group
  ON session_assignments (training_slot_id, scheduled_date, target_group_id)
  WHERE training_slot_id IS NOT NULL AND status != 'cancelled';

-- 2. Atomic swim session update (transaction: delete items + insert new ones)
CREATE OR REPLACE FUNCTION public.update_swim_session_atomic(
  p_session_id int,
  p_name text,
  p_description text DEFAULT NULL,
  p_total_distance int DEFAULT NULL,
  p_folder text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  -- Update session metadata
  UPDATE swim_sessions_catalog SET
    name = p_name,
    description = p_description,
    total_distance = p_total_distance,
    folder = p_folder
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session % not found', p_session_id;
  END IF;

  -- Delete existing items
  DELETE FROM swim_session_items WHERE catalog_id = p_session_id;

  -- Insert new items
  IF jsonb_array_length(p_items) > 0 THEN
    INSERT INTO swim_session_items (catalog_id, ordre, label, distance, duration, intensity, notes, raw_payload)
    SELECT
      p_session_id,
      (item->>'ordre')::int,
      item->>'label',
      NULLIF(item->>'distance', '')::int,
      NULLIF(item->>'duration', '')::int,
      item->>'intensity',
      item->>'notes',
      CASE WHEN item ? 'raw_payload' AND item->>'raw_payload' != 'null'
        THEN (item->>'raw_payload')::jsonb ELSE NULL END
    FROM jsonb_array_elements(p_items) AS item;
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'items_count', v_count
  );
END;
$$;

-- 3. Clean up orphaned assignments when session is deleted
-- Instead of changing FK to CASCADE (which would silently delete assignments),
-- add a trigger that cancels assignments when their session is deleted
CREATE OR REPLACE FUNCTION public.cancel_orphaned_assignments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE session_assignments
  SET status = 'cancelled', swim_catalog_id = NULL
  WHERE swim_catalog_id = OLD.id AND status != 'cancelled';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cancel_orphaned_assignments ON swim_sessions_catalog;
CREATE TRIGGER trg_cancel_orphaned_assignments
  BEFORE DELETE ON swim_sessions_catalog
  FOR EACH ROW EXECUTE FUNCTION cancel_orphaned_assignments();
