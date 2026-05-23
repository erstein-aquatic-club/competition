-- 00187_update_session_atomic_target_intensity.sql
-- §298 — Thread target_intensity through the atomic session update RPC.
--
-- update_strength_session_atomic insère les items via une LISTE DE CHAMPS
-- EXPLICITE qui omettait target_intensity : la cible prescrite par le coach
-- était donc silencieusement perdue à chaque mise à jour de séance.
-- On recompile la fonction en ajoutant la colonne (lecture via row_to_json
-- dans get_strength_catalog_paginated — pas de changement requis là-bas).

CREATE OR REPLACE FUNCTION public.update_strength_session_atomic(
  p_session_id integer,
  p_name text,
  p_description text,
  p_folder_id integer,
  p_items jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- 1. Update session metadata
  UPDATE strength_sessions
  SET name = p_name,
      description = p_description,
      folder_id = p_folder_id
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session % not found', p_session_id;
  END IF;

  -- 2. Delete old items (within same transaction)
  DELETE FROM strength_session_items WHERE session_id = p_session_id;

  -- 3. Insert new items (if any)
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    INSERT INTO strength_session_items (
      session_id, ordre, exercise_id, block, cycle_type,
      sets, reps, pct_1rm, rest_series_s, rest_exercise_s, notes,
      target_intensity, raw_payload
    )
    SELECT
      p_session_id,
      (item->>'ordre')::INTEGER,
      (item->>'exercise_id')::INTEGER,
      COALESCE(item->>'block', 'main'),
      COALESCE(item->>'cycle_type', 'normal'),
      (item->>'sets')::INTEGER,
      (item->>'reps')::INTEGER,
      (item->>'pct_1rm')::DOUBLE PRECISION,
      (item->>'rest_series_s')::INTEGER,
      (item->>'rest_exercise_s')::INTEGER,
      item->>'notes',
      (item->>'target_intensity')::DOUBLE PRECISION,
      item->'raw_payload'
    FROM jsonb_array_elements(p_items) AS item;
  END IF;

  RETURN jsonb_build_object('status', 'updated', 'session_id', p_session_id);
END;
$function$;
