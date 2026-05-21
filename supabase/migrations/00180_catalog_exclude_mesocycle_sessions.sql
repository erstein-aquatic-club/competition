-- 00180_catalog_exclude_mesocycle_sessions.sql
-- §296 — Bug 2 du test réel §293 : la bibliothèque coach
-- (`/coach/library` → onglet Musculation, alimenté par
-- `get_strength_catalog_paginated`) liste les 20 templates `[Méso XX]`
-- créés par la RPC `apply_strength_mesocycle` pour chaque mésocycle. Ces
-- templates ont `folder_id = NULL` donc tombent en "unfiledSessions" et
-- polluent visuellement la library.
--
-- Fix : la RPC catalog filtre désormais les sessions générées par un
-- mésocycle (préfixe `[Méso `). Ces templates restent atteignables :
--  * côté nageur via `strength_planning_slot_overrides.session_template_id`
--    (consommé par MyPlanTab + WorkoutRunner)
--  * côté coach via `CoachMesocyclePanel` (qui les fetch via
--    `getMesocycleSessionsContent` → `raw_payload->>'mesocycle_id'`)
--  * et restent éditables séance par séance dans la timeline coach.
--
-- Le coach voit donc le mésocycle comme un UN BLOC (sur la fiche
-- nageur) plutôt qu'éparpillé dans la library.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_strength_catalog_paginated(
  p_offset    integer DEFAULT 0,
  p_limit     integer DEFAULT 20,
  p_search    text    DEFAULT NULL::text,
  p_folder_id integer DEFAULT NULL::integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total int;
  v_sessions jsonb;
BEGIN
  SELECT count(*) INTO v_total
  FROM strength_sessions ss
  WHERE (p_search IS NULL OR ss.name ILIKE '%' || p_search || '%')
    AND (p_folder_id IS NULL OR ss.folder_id = p_folder_id)
    AND ss.name NOT LIKE '[Méso %';

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
      AND ss.name NOT LIKE '[Méso %'
    ORDER BY ss.created_at DESC
    OFFSET p_offset LIMIT p_limit
  ) sub;

  RETURN jsonb_build_object('sessions', v_sessions, 'total', v_total);
END;
$function$;

COMMIT;
