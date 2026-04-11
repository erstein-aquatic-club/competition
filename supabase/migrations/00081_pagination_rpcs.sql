-- Migration 00081: Paginated RPC functions
-- Replaces full-table loads with offset/limit queries + total count

-- RPC: get_athletes_paginated
-- Replaces 3 separate queries in getAthletes() (users.ts)
CREATE OR REPLACE FUNCTION public.get_athletes_paginated(
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 20,
  p_search text DEFAULT NULL,
  p_group_id int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_athletes jsonb;
BEGIN
  -- Count total matching athletes
  SELECT count(DISTINCT u.id) INTO v_total
  FROM users u
  LEFT JOIN group_members gm ON gm.user_id = u.id
  LEFT JOIN groups g ON g.id = gm.group_id AND g.is_temporary = false
  WHERE u.role = 'athlete'
    AND (p_search IS NULL OR u.display_name ILIKE '%' || p_search || '%')
    AND (p_group_id IS NULL OR gm.group_id = p_group_id);

  -- Fetch page of athletes with profiles and groups
  SELECT COALESCE(jsonb_agg(athlete_row ORDER BY athlete_row->>'display_name'), '[]'::jsonb)
  INTO v_athletes
  FROM (
    SELECT DISTINCT ON (u.id) jsonb_build_object(
      'id', u.id,
      'display_name', u.display_name,
      'email', u.email,
      'role', u.role,
      'created_at', u.created_at,
      'ffn_iuf', up.ffn_iuf,
      'avatar_url', up.avatar_url,
      'sex', up.sex,
      'birthdate', up.birthdate,
      'phone', up.phone,
      'bio', up.bio,
      'neurotype_result', up.neurotype_result,
      'group_id', gm.group_id,
      'group_name', g.name
    ) AS athlete_row
    FROM users u
    LEFT JOIN user_profiles up ON up.user_id = u.id
    LEFT JOIN group_members gm ON gm.user_id = u.id
    LEFT JOIN groups g ON g.id = gm.group_id AND g.is_temporary = false
    WHERE u.role = 'athlete'
      AND (p_search IS NULL OR u.display_name ILIKE '%' || p_search || '%')
      AND (p_group_id IS NULL OR gm.group_id = p_group_id)
    ORDER BY u.id
    OFFSET p_offset LIMIT p_limit
  ) sub;

  RETURN jsonb_build_object('athletes', v_athletes, 'total', v_total);
END;
$$;

-- RPC: get_swim_catalog_paginated
-- Replaces full load in getSwimSessions() (swim.ts)
CREATE OR REPLACE FUNCTION public.get_swim_catalog_paginated(
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 20,
  p_search text DEFAULT NULL,
  p_folder text DEFAULT NULL
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
  FROM swim_sessions_catalog sc
  WHERE (sc.is_archived IS NOT TRUE)
    AND (p_search IS NULL OR sc.name ILIKE '%' || p_search || '%')
    AND (p_folder IS NULL OR sc.folder = p_folder);

  SELECT COALESCE(jsonb_agg(s ORDER BY s->>'created_at' DESC), '[]'::jsonb)
  INTO v_sessions
  FROM (
    SELECT jsonb_build_object(
      'id', sc.id,
      'name', sc.name,
      'description', sc.description,
      'total_distance', sc.total_distance,
      'folder', sc.folder,
      'is_archived', sc.is_archived,
      'created_at', sc.created_at,
      'created_by', sc.created_by,
      'share_token', sc.share_token,
      'items', COALESCE(
        (SELECT jsonb_agg(row_to_json(si.*) ORDER BY si.ordre)
         FROM swim_session_items si WHERE si.catalog_id = sc.id),
        '[]'::jsonb
      )
    ) AS s
    FROM swim_sessions_catalog sc
    WHERE (sc.is_archived IS NOT TRUE)
      AND (p_search IS NULL OR sc.name ILIKE '%' || p_search || '%')
      AND (p_folder IS NULL OR sc.folder = p_folder)
    ORDER BY sc.created_at DESC
    OFFSET p_offset LIMIT p_limit
  ) sub;

  RETURN jsonb_build_object('sessions', v_sessions, 'total', v_total);
END;
$$;

-- RPC: get_strength_catalog_paginated
-- Replaces full load in getStrengthSessions() (strength.ts)
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
      'cycle', ss.cycle,
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
