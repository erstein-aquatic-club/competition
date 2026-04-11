-- Migration 00088: Atomic swim session CREATE + dedup fix + visible_from constraint

-- 1. Atomic CREATE swim session (header + items in one transaction)
CREATE OR REPLACE FUNCTION public.create_swim_session_atomic(
  p_name text,
  p_description text DEFAULT NULL,
  p_total_distance int DEFAULT NULL,
  p_folder text DEFAULT NULL,
  p_created_by int DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id int;
  v_items_count int;
BEGIN
  INSERT INTO swim_sessions_catalog (name, description, total_distance, folder, created_by)
  VALUES (p_name, p_description, p_total_distance, p_folder, p_created_by)
  RETURNING id INTO v_session_id;

  IF jsonb_array_length(p_items) > 0 THEN
    INSERT INTO swim_session_items (catalog_id, ordre, label, distance, duration, intensity, notes, raw_payload)
    SELECT
      v_session_id,
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

  GET DIAGNOSTICS v_items_count = ROW_COUNT;

  RETURN jsonb_build_object('session_id', v_session_id, 'items_count', v_items_count);
END;
$$;

-- 2. Fix UNIQUE constraint to cover subgroup assignments
-- Drop old partial index and create a more comprehensive one
DROP INDEX IF EXISTS idx_sa_unique_slot_group;
CREATE UNIQUE INDEX idx_sa_unique_slot_group_v2
  ON session_assignments (training_slot_id, scheduled_date, target_group_id, COALESCE(target_subgroup_id, -1))
  WHERE training_slot_id IS NOT NULL AND status != 'cancelled';

-- 3. CHECK constraint: visible_from must be <= scheduled_date (when both are set)
ALTER TABLE session_assignments ADD CONSTRAINT chk_visible_from_before_date
  CHECK (visible_from IS NULL OR scheduled_date IS NULL OR visible_from <= scheduled_date)
  NOT VALID;
