-- 00173_revert_strength_mesocycle.sql
-- §293 — RPC revert_strength_mesocycle : annule un mésocycle généré et
-- restaure l'état du planning d'avant le `apply`.
--
-- Conception : docs/plans/bilan-muscu-mapping-mesocycle-planning.md §3
--
-- Séquence transactionnelle :
--   1. Auth : appelant = athlete du mésocycle OU coach/admin.
--   2. Charge le mésocycle (doit exister ; doit être 'active' — sinon erreur).
--   3. Charge le snapshot associé.
--   4. Identifie les templates créés par le mésocycle via
--      `strength_session_items.raw_payload->>'mesocycle_id'`.
--   5. DELETE les `strength_planning_slot_overrides` pointant ces templates
--      (et déduit la fenêtre de semaines pour le nettoyage des week_overrides).
--   6. DELETE les `strength_planning_week_overrides` dans la fenêtre dont
--      les notes mentionnent ce mésocycle (préfixe 'Mésocycle <short_id>').
--   7. DELETE les `strength_sessions` (CASCADE → strength_session_items).
--   8. Restore depuis snapshot.slot_overrides + snapshot.week_overrides.
--   9. UPDATE strength_mesocycles SET status='reverted'.
--   10. (Si appelant = coach et ≠ athlete) INSERT notification pour le nageur.
--
-- SECURITY DEFINER — vérifie elle-même le rôle de l'appelant.

BEGIN;

CREATE OR REPLACE FUNCTION revert_strength_mesocycle(
  p_mesocycle_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id        integer;
  v_caller_role      text;
  v_athlete_id       integer;
  v_short_id         text;
  v_status           text;
  v_snapshot_slots   jsonb;
  v_snapshot_weeks   jsonb;
  v_window_start     date;
  v_window_end       date;
  v_template_ids     integer[];
  v_athlete_name     text;
  v_notification_id  integer;
  v_existed          boolean;
BEGIN
  -- ── 1. Auth ───────────────────────────────────────────────────────────
  v_caller_id   := app_user_id();
  v_caller_role := app_user_role();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'revert_strength_mesocycle: no app_user_id in JWT'
      USING ERRCODE = '42501';
  END IF;

  -- ── 2. Load mesocycle ─────────────────────────────────────────────────
  SELECT athlete_id, status INTO v_athlete_id, v_status
    FROM strength_mesocycles
   WHERE id = p_mesocycle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revert_strength_mesocycle: mesocycle % not found', p_mesocycle_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_caller_id <> v_athlete_id AND v_caller_role NOT IN ('coach', 'admin') THEN
    RAISE EXCEPTION 'revert_strength_mesocycle: caller % not authorized for athlete %',
      v_caller_id, v_athlete_id
      USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'revert_strength_mesocycle: mesocycle % is %, only ''active'' can be reverted',
      p_mesocycle_id, v_status
      USING ERRCODE = '22023';
  END IF;

  v_short_id := substring(p_mesocycle_id::text from 1 for 8);

  -- ── 3. Load snapshot ──────────────────────────────────────────────────
  SELECT slot_overrides, week_overrides
    INTO v_snapshot_slots, v_snapshot_weeks
    FROM strength_planning_snapshots
   WHERE mesocycle_id = p_mesocycle_id
   ORDER BY created_at DESC
   LIMIT 1;
  IF v_snapshot_slots IS NULL THEN
    v_snapshot_slots := '[]'::jsonb;
  END IF;
  IF v_snapshot_weeks IS NULL THEN
    v_snapshot_weeks := '[]'::jsonb;
  END IF;

  -- ── 4. Identify templates created by this mesocycle ──────────────────
  SELECT COALESCE(array_agg(DISTINCT session_id), ARRAY[]::integer[])
    INTO v_template_ids
    FROM strength_session_items
   WHERE raw_payload->>'mesocycle_id' = p_mesocycle_id::text;

  -- Compute the planning window from the templates' slot overrides.
  IF array_length(v_template_ids, 1) > 0 THEN
    SELECT MIN(week_start), MAX(week_start)
      INTO v_window_start, v_window_end
      FROM strength_planning_slot_overrides
     WHERE athlete_id = v_athlete_id
       AND session_template_id = ANY (v_template_ids);
  END IF;

  -- ── 5. DELETE slot_overrides pointing to our templates ───────────────
  IF array_length(v_template_ids, 1) > 0 THEN
    DELETE FROM strength_planning_slot_overrides
     WHERE athlete_id = v_athlete_id
       AND session_template_id = ANY (v_template_ids);
  END IF;

  -- ── 6. DELETE week_overrides in window dont les notes mentionnent ce méso ─
  IF v_window_start IS NOT NULL THEN
    DELETE FROM strength_planning_week_overrides
     WHERE athlete_id = v_athlete_id
       AND week_start BETWEEN v_window_start AND v_window_end
       AND COALESCE(notes, '') LIKE 'Mésocycle ' || v_short_id || ' %';
  END IF;

  -- ── 7. DELETE templates (CASCADE drops items) ────────────────────────
  IF array_length(v_template_ids, 1) > 0 THEN
    DELETE FROM strength_sessions
     WHERE id = ANY (v_template_ids);
  END IF;

  -- ── 8. Restore from snapshot ──────────────────────────────────────────
  -- 8a. slot_overrides
  IF jsonb_array_length(v_snapshot_slots) > 0 THEN
    INSERT INTO strength_planning_slot_overrides (
      id, athlete_id, week_start, day_of_week, time_slot,
      session_template_id, notes, created_at
    )
    SELECT
      (rec->>'id')::uuid,
      (rec->>'athlete_id')::int,
      (rec->>'week_start')::date,
      (rec->>'day_of_week')::int,
      rec->>'time_slot',
      NULLIF(rec->>'session_template_id', '')::int,
      rec->>'notes',
      COALESCE((rec->>'created_at')::timestamptz, now())
    FROM jsonb_array_elements(v_snapshot_slots) AS rec
    ON CONFLICT (athlete_id, week_start, day_of_week, time_slot) DO UPDATE
      SET session_template_id = EXCLUDED.session_template_id,
          notes               = EXCLUDED.notes;
  END IF;

  -- 8b. week_overrides
  IF jsonb_array_length(v_snapshot_weeks) > 0 THEN
    INSERT INTO strength_planning_week_overrides (
      id, athlete_id, week_start, week_type, notes, updated_at
    )
    SELECT
      (rec->>'id')::uuid,
      (rec->>'athlete_id')::int,
      (rec->>'week_start')::date,
      rec->>'week_type',
      rec->>'notes',
      COALESCE((rec->>'updated_at')::timestamptz, now())
    FROM jsonb_array_elements(v_snapshot_weeks) AS rec
    ON CONFLICT (athlete_id, week_start) DO UPDATE
      SET week_type  = EXCLUDED.week_type,
          notes      = EXCLUDED.notes,
          updated_at = EXCLUDED.updated_at;
  END IF;

  -- ── 9. Mark mesocycle as reverted ────────────────────────────────────
  UPDATE strength_mesocycles
     SET status = 'reverted'
   WHERE id = p_mesocycle_id;

  -- ── 10. Notif au nageur si le revert vient du coach ──────────────────
  IF v_caller_id <> v_athlete_id THEN
    SELECT u.display_name INTO v_athlete_name FROM users u WHERE u.id = v_athlete_id;
    INSERT INTO notifications (title, body, type, created_by, metadata)
    VALUES (
      'Mésocycle muscu annulé',
      format('Ton coach a annulé le mésocycle %s. La planif d''avant a été restaurée.',
        v_short_id),
      'message',
      v_caller_id,
      jsonb_build_object(
        'kind',          'strength_mesocycle_reverted',
        'mesocycle_id', p_mesocycle_id,
        'athlete_id',   v_athlete_id,
        'target_role',  'athlete'
      )
    )
    RETURNING id INTO v_notification_id;

    INSERT INTO notification_targets (notification_id, target_user_id)
    VALUES (v_notification_id, v_athlete_id);
  END IF;

  -- Marqueur volontaire pour silence le warning unused
  v_existed := true;
  PERFORM v_existed;
END;
$$;

GRANT EXECUTE ON FUNCTION revert_strength_mesocycle(uuid) TO authenticated;

COMMENT ON FUNCTION revert_strength_mesocycle(uuid) IS '§293 — Annule un mésocycle ''active'' et restaure le planning d''avant son application. SECURITY DEFINER : appelable par le nageur lui-même OU par un coach/admin. Marque le mésocycle ''reverted'' ; notif au nageur si revert venant du coach.';

COMMIT;
