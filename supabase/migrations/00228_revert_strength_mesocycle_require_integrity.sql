-- 00228_revert_strength_mesocycle_require_integrity.sql
-- Protection P0 : les cycles importés manuellement peuvent exister dans
-- strength_mesocycles SANS strength_planning_snapshots NI marqueurs d'items.
-- La fonction historique rebasculait leur statut "reverted" sans effacer
-- ni restaurer leurs slots, laissant "Mon plan" incohérent.
--
-- Recréation de la fonction en copiant sa définition VIVANTE du 13/11/2026,
-- avec deux refus bloquants AVANT toute mutation :
--  (1) snapshot absent (un snapshot présent mais vide est valide) ;
--  (2) aucun template d'exercice taggué au mesocycle_id.
-- Aucun changement au chemin nominal de génération/revert.
--
-- À déployer après revue des tests RLS et contrôle des usages. Cette migration
-- ne corrige PAS rétroactivement les imports incomplets (reconstruction dédiée).
CREATE OR REPLACE FUNCTION public.revert_strength_mesocycle(p_mesocycle_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id integer; v_caller_role text; v_athlete_id integer;
  v_short_id text; v_status text; v_snapshot_slots jsonb; v_snapshot_weeks jsonb;
  v_window_start date; v_window_end date; v_template_ids integer[];
  v_athlete_name text; v_notification_id integer;
BEGIN
  v_caller_id := app_user_id(); v_caller_role := app_user_role();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'revert_strength_mesocycle: no app_user_id in JWT' USING ERRCODE = '42501';
  END IF;
  SELECT athlete_id, status INTO v_athlete_id, v_status FROM strength_mesocycles WHERE id = p_mesocycle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revert_strength_mesocycle: mesocycle % not found', p_mesocycle_id USING ERRCODE = 'P0002';
  END IF;
  IF v_caller_id <> v_athlete_id AND v_caller_role NOT IN ('coach', 'admin') THEN
    RAISE EXCEPTION 'revert_strength_mesocycle: caller % not authorized for athlete %', v_caller_id, v_athlete_id USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'revert_strength_mesocycle: mesocycle % is %, only ''active'' can be reverted', p_mesocycle_id, v_status USING ERRCODE = '22023';
  END IF;
  v_short_id := substring(p_mesocycle_id::text from 1 for 8);
  SELECT slot_overrides, week_overrides INTO v_snapshot_slots, v_snapshot_weeks
    FROM strength_planning_snapshots WHERE mesocycle_id = p_mesocycle_id ORDER BY created_at DESC LIMIT 1;
  -- Un import SQL/PDF peut avoir une fiche de mésocycle sans état de retour.
  -- Refuser AVANT toute suppression ou modification de status.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revert_strength_mesocycle: missing planning snapshot for mesocycle %; refusing unsafe revert',
      p_mesocycle_id USING ERRCODE = '22023';
  END IF;
  IF v_snapshot_slots IS NULL THEN v_snapshot_slots := '[]'::jsonb; END IF;
  IF v_snapshot_weeks IS NULL THEN v_snapshot_weeks := '[]'::jsonb; END IF;
  SELECT COALESCE(array_agg(DISTINCT session_id), ARRAY[]::integer[]) INTO v_template_ids
    FROM strength_session_items WHERE raw_payload->>'mesocycle_id' = p_mesocycle_id::text;
  -- Un mésocycle sans séances possédées serait marqué "reverted" alors que
  -- ses créneaux (import manuel non taggué) resteraient visibles.
  IF COALESCE(array_length(v_template_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'revert_strength_mesocycle: no tagged session templates for mesocycle %; refusing unsafe revert',
      p_mesocycle_id USING ERRCODE = '22023';
  END IF;
  IF array_length(v_template_ids, 1) > 0 THEN
    SELECT MIN(week_start), MAX(week_start) INTO v_window_start, v_window_end
      FROM strength_planning_slot_overrides WHERE athlete_id = v_athlete_id AND session_template_id = ANY (v_template_ids);
  END IF;
  IF array_length(v_template_ids, 1) > 0 THEN
    DELETE FROM strength_planning_slot_overrides WHERE athlete_id = v_athlete_id AND session_template_id = ANY (v_template_ids);
  END IF;
  IF v_window_start IS NOT NULL THEN
    DELETE FROM strength_planning_week_overrides
     WHERE athlete_id = v_athlete_id AND week_start BETWEEN v_window_start AND v_window_end
       AND COALESCE(notes, '') LIKE 'Mésocycle ' || v_short_id || ' %';
  END IF;
  IF array_length(v_template_ids, 1) > 0 THEN
    DELETE FROM strength_sessions WHERE id = ANY (v_template_ids);
  END IF;
  IF jsonb_array_length(v_snapshot_slots) > 0 THEN
    INSERT INTO strength_planning_slot_overrides (id, athlete_id, week_start, day_of_week, time_slot, session_template_id, notes, created_at)
    SELECT (rec->>'id')::uuid, (rec->>'athlete_id')::int, (rec->>'week_start')::date,
      (rec->>'day_of_week')::int, rec->>'time_slot', NULLIF(rec->>'session_template_id', '')::int,
      rec->>'notes', COALESCE((rec->>'created_at')::timestamptz, now())
    FROM jsonb_array_elements(v_snapshot_slots) AS rec
    ON CONFLICT (athlete_id, week_start, day_of_week, time_slot) DO UPDATE
      SET session_template_id = EXCLUDED.session_template_id, notes = EXCLUDED.notes;
  END IF;
  IF jsonb_array_length(v_snapshot_weeks) > 0 THEN
    INSERT INTO strength_planning_week_overrides (id, athlete_id, week_start, week_type, notes, updated_at)
    SELECT (rec->>'id')::uuid, (rec->>'athlete_id')::int, (rec->>'week_start')::date,
      rec->>'week_type', rec->>'notes', COALESCE((rec->>'updated_at')::timestamptz, now())
    FROM jsonb_array_elements(v_snapshot_weeks) AS rec
    ON CONFLICT (athlete_id, week_start) DO UPDATE
      SET week_type = EXCLUDED.week_type, notes = EXCLUDED.notes, updated_at = EXCLUDED.updated_at;
  END IF;
  UPDATE strength_mesocycles SET status = 'reverted' WHERE id = p_mesocycle_id;
  IF v_caller_id <> v_athlete_id THEN
    SELECT u.display_name INTO v_athlete_name FROM users u WHERE u.id = v_athlete_id;
    INSERT INTO notifications (title, body, type, created_by, metadata) VALUES (
      'Mésocycle muscu annulé',
      format('Ton coach a annulé le mésocycle %s. La planif d''avant a été restaurée.', v_short_id),
      'message', v_caller_id,
      jsonb_build_object('kind', 'strength_mesocycle_reverted',
        'mesocycle_id', p_mesocycle_id, 'athlete_id', v_athlete_id, 'target_role', 'athlete')
    ) RETURNING id INTO v_notification_id;
    INSERT INTO notification_targets (notification_id, target_user_id) VALUES (v_notification_id, v_athlete_id);
  END IF;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.revert_strength_mesocycle(uuid) TO authenticated;
COMMENT ON FUNCTION public.revert_strength_mesocycle(uuid) IS
  'Annule un mesocycle actif et restaure son snapshot ; refuse une annulation si snapshot ou tags de seances sont absents.';
