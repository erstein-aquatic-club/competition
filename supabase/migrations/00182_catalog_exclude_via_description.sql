-- 00182_catalog_exclude_via_description.sql
-- §296 — Suite de la mig 00180 + 00181 : le filtre catalog excluait sur
-- `name LIKE '[Méso %'`, mais 00181 a renommé les sessions générées par
-- mésocycle avec des libellés FR propres (`Force haut + Puissance bas`).
-- Le filtre catalog ne fonctionnait plus → les 20 sessions polluaient de
-- nouveau la library coach.
--
-- Fix : filtrer sur `description LIKE '[Méso %'` (description contient
-- toujours le préfixe `[Méso XX] · SXX JX · …` posé par la RPC pour les
-- futures générations, ET conserve l'ancien nom complet pour les sessions
-- backfilled — les 2 commencent par `[Méso `).

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
    AND COALESCE(ss.description, '') NOT LIKE '[Méso %';

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
      AND COALESCE(ss.description, '') NOT LIKE '[Méso %'
    ORDER BY ss.created_at DESC
    OFFSET p_offset LIMIT p_limit
  ) sub;

  RETURN jsonb_build_object('sessions', v_sessions, 'total', v_total);
END;
$function$;

COMMIT;
