-- Migration 00089: Fix pagination RPCs — missing/wrong column references
-- 1. Add missing total_distance column to swim_sessions_catalog
-- 2. Fix get_swim_catalog_paginated (now total_distance exists)
-- 3. Fix get_strength_catalog_paginated (remove non-existent ss.cycle)

-- 1. Add total_distance to swim_sessions_catalog (used by create/update RPCs)
ALTER TABLE swim_sessions_catalog
  ADD COLUMN IF NOT EXISTS total_distance INT DEFAULT NULL;

-- 2. Recreate get_strength_catalog_paginated without ss.cycle
CREATE OR REPLACE FUNCTION public.get_strength_catalog_paginated(
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 20,
  p_search text DEFAULT NULL,
  p_folder_id int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_sessions jsonb;
BEGIN
  SELECT count(*) INTO v_total
  FROM strength_sessions ss
  WHERE (p_search IS NULL OR ss.name ILIKE '%' || p_search || '%')
    AND (p_folder_id IS NULL OR ss.folder_id = p_folder_id);

  SELECT COALESCE(jsonb_agg(s ORDER BY s->>'created_at' DESC), '[]'::jsonb)
  INTO v_sessions
  FROM (
    SELECT jsonb_build_object(
      'id', ss.id,
      'name', ss.name,
      'description', ss.description,
      'created_at', ss.created_at,
      'created_by', ss.created_by,
      'folder_id', ss.folder_id,
      'items', COALESCE(
        (SELECT jsonb_agg(row_to_json(si.*) ORDER BY si.ordre)
         FROM strength_session_items si WHERE si.session_id = ss.id),
        '[]'::jsonb
      )
    ) AS s
    FROM strength_sessions ss
    WHERE (p_search IS NULL OR ss.name ILIKE '%' || p_search || '%')
      AND (p_folder_id IS NULL OR ss.folder_id = p_folder_id)
    ORDER BY ss.created_at DESC
    OFFSET p_offset LIMIT p_limit
  ) sub;

  RETURN jsonb_build_object('sessions', v_sessions, 'total', v_total);
END;
$$;
