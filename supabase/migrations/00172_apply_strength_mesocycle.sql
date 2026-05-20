-- 00172_apply_strength_mesocycle.sql
-- §293 — RPC apply_strength_mesocycle : matérialise un mésocycle généré par
-- le moteur (`mesocycleEngine.ts`) sur la timeline `strength_planning_*`
-- existante.
--
-- Conception : docs/plans/bilan-muscu-mapping-mesocycle-planning.md
--
-- Séquence transactionnelle :
--   1. Auth : app_user_id() = athlete OU rôle coach/admin.
--   2. Supersede des mésocycles 'active' précédents du même athlète.
--   3. INSERT strength_mesocycles → new mesocycle_id.
--   4. Snapshot de strength_planning_slot_overrides + week_overrides en
--      fenêtre [start, start + N·7) → strength_planning_snapshots.
--   5. Pour chaque (semaine, session) du payload p_weeks :
--      a. INSERT strength_sessions (nom préfixé '[Méso <short_id>]…')
--      b. INSERT strength_session_items (un par exercice, raw_payload
--         contient mesocycle_id + periodization_cycle + bucket + …)
--      c. UPSERT strength_planning_slot_overrides
--   6. UPSERT strength_planning_week_overrides (week_type = label cycle).
--   7. INSERT notifications + notification_targets (groupe de l'athlète).
--
-- SECURITY DEFINER (manipule slot_overrides dont l'INSERT est réservé
-- coach/admin par RLS). La RPC vérifie elle-même le rôle de l'appelant.

BEGIN;

CREATE OR REPLACE FUNCTION apply_strength_mesocycle(
  p_athlete_id        integer,
  p_assessment_id     uuid,
  p_template_id       uuid,
  p_event_group       text,
  p_kind              text,
  p_target_week_count integer,
  p_sessions_per_week integer,
  p_start_week_monday date,
  p_bucket_priorities jsonb,
  p_engine_version    text,
  p_weeks             jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id        integer;
  v_caller_role      text;
  v_mesocycle_id     uuid;
  v_short_id         text;
  v_window_end       date;
  v_athlete_group_id integer;
  v_notification_id  integer;
  v_athlete_name     text;
  v_days             integer[];
  v_week             jsonb;
  v_session          jsonb;
  v_exercise         jsonb;
  v_week_number      integer;
  v_session_number   integer;
  v_week_start       date;
  v_day_of_week      integer;
  v_template_id      integer;
  v_cycle            text;
  v_cycle_legacy     text;
  v_cycle_label      text;
  v_ordre            integer;
  v_block            text;
  v_warmup_left      integer;
BEGIN
  -- ── 1. Auth ───────────────────────────────────────────────────────────
  v_caller_id   := app_user_id();
  v_caller_role := app_user_role();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'apply_strength_mesocycle: no app_user_id in JWT'
      USING ERRCODE = '42501';
  END IF;
  IF v_caller_id <> p_athlete_id AND v_caller_role NOT IN ('coach', 'admin') THEN
    RAISE EXCEPTION 'apply_strength_mesocycle: caller % not authorized for athlete %',
      v_caller_id, p_athlete_id
      USING ERRCODE = '42501';
  END IF;

  -- Sanity bounds
  IF p_target_week_count <= 0 THEN
    RAISE EXCEPTION 'apply_strength_mesocycle: target_week_count must be > 0';
  END IF;
  IF p_sessions_per_week NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'apply_strength_mesocycle: sessions_per_week must be 1..7';
  END IF;

  v_window_end := p_start_week_monday + ((p_target_week_count - 1) * 7);

  -- Day-of-week pattern by sessions_per_week (0 = Monday).
  v_days := CASE p_sessions_per_week
    WHEN 1 THEN ARRAY[0]
    WHEN 2 THEN ARRAY[0, 3]
    WHEN 3 THEN ARRAY[0, 2, 4]
    WHEN 4 THEN ARRAY[0, 1, 3, 4]
    WHEN 5 THEN ARRAY[0, 1, 2, 3, 4]
    WHEN 6 THEN ARRAY[0, 1, 2, 3, 4, 5]
    WHEN 7 THEN ARRAY[0, 1, 2, 3, 4, 5, 6]
  END;

  -- ── 2. Supersede previous active mesocycle(s) ────────────────────────
  UPDATE strength_mesocycles
     SET status = 'superseded'
   WHERE athlete_id = p_athlete_id
     AND status     = 'active';

  -- ── 3. Insert the new mesocycle ───────────────────────────────────────
  INSERT INTO strength_mesocycles (
    athlete_id, assessment_id, template_id, event_group, kind,
    target_week_count, sessions_per_week, status,
    bucket_priorities, engine_version, generated_by
  )
  VALUES (
    p_athlete_id, p_assessment_id, p_template_id, p_event_group, p_kind,
    p_target_week_count, p_sessions_per_week, 'active',
    p_bucket_priorities, p_engine_version, v_caller_id
  )
  RETURNING id INTO v_mesocycle_id;

  v_short_id := substring(v_mesocycle_id::text from 1 for 8);

  -- ── 4. Snapshot existing overrides in the window ─────────────────────
  INSERT INTO strength_planning_snapshots (
    mesocycle_id, athlete_id, slot_overrides, week_overrides
  )
  VALUES (
    v_mesocycle_id,
    p_athlete_id,
    COALESCE((
      SELECT jsonb_agg(to_jsonb(o.*))
        FROM strength_planning_slot_overrides o
       WHERE o.athlete_id = p_athlete_id
         AND o.week_start BETWEEN p_start_week_monday AND v_window_end
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(to_jsonb(w.*))
        FROM strength_planning_week_overrides w
       WHERE w.athlete_id = p_athlete_id
         AND w.week_start BETWEEN p_start_week_monday AND v_window_end
    ), '[]'::jsonb)
  );

  -- ── 5+6. Materialize weeks, sessions, templates, items, overrides ────
  FOR v_week IN SELECT * FROM jsonb_array_elements(p_weeks) LOOP
    v_week_number  := (v_week->>'week_number')::int;
    v_cycle        := v_week->>'cycle';
    v_week_start   := p_start_week_monday + ((v_week_number - 1) * 7);

    v_cycle_legacy := CASE v_cycle
      WHEN 'prepa_generale' THEN 'endurance'
      ELSE 'force'
    END;
    v_cycle_label := CASE v_cycle
      WHEN 'prepa_generale' THEN 'Préparation générale'
      WHEN 'force_max'      THEN 'Force max'
      WHEN 'puissance'      THEN 'Puissance / vitesse'
      WHEN 'maintien'       THEN 'Maintien'
      WHEN 'affutage'       THEN 'Affûtage'
      WHEN 'pic'            THEN 'Pic'
      ELSE v_cycle
    END;

    -- 6. Week meta override (upsert)
    INSERT INTO strength_planning_week_overrides (
      athlete_id, week_start, week_type, notes
    )
    VALUES (
      p_athlete_id, v_week_start, v_cycle_label,
      format('Mésocycle %s · semaine %s/%s',
        v_short_id, v_week_number, p_target_week_count)
    )
    ON CONFLICT (athlete_id, week_start) DO UPDATE
      SET week_type  = EXCLUDED.week_type,
          notes      = EXCLUDED.notes,
          updated_at = now();

    -- 5. Sessions of this week
    FOR v_session IN SELECT * FROM jsonb_array_elements(v_week->'sessions') LOOP
      v_session_number := (v_session->>'session_number')::int;
      IF v_session_number < 1 OR v_session_number > array_length(v_days, 1) THEN
        CONTINUE;
      END IF;
      v_day_of_week := v_days[v_session_number];

      -- 5a. Create the session template row
      INSERT INTO strength_sessions (name, description, folder_id, created_by)
      VALUES (
        format('[Méso %s] S%s J%s · %s · %s',
          v_short_id,
          lpad(v_week_number::text, 2, '0'),
          v_session_number,
          v_cycle,
          COALESCE(v_session->'buckets'->>0, 'mixed')),
        format('Généré par mésocycle %s (engine %s)', v_short_id, p_engine_version),
        NULL,
        p_athlete_id
      )
      RETURNING id INTO v_template_id;

      -- Count consecutive leading mobility exercises = warmup block size
      v_warmup_left := 0;
      FOR v_exercise IN SELECT * FROM jsonb_array_elements(v_session->'exercises') LOOP
        IF (v_exercise->>'bucket') = 'mobility' THEN
          v_warmup_left := v_warmup_left + 1;
        ELSE
          EXIT;
        END IF;
      END LOOP;

      -- 5b. Insert items
      v_ordre := 0;
      FOR v_exercise IN SELECT * FROM jsonb_array_elements(v_session->'exercises') LOOP
        v_ordre := v_ordre + 1;
        IF v_ordre <= v_warmup_left THEN
          v_block := 'warmup';
        ELSE
          v_block := 'main';
        END IF;

        INSERT INTO strength_session_items (
          session_id, ordre, exercise_id, block, cycle_type,
          sets, reps, pct_1rm, rest_series_s, rest_exercise_s,
          notes, raw_payload
        )
        VALUES (
          v_template_id,
          v_ordre,
          (v_exercise->>'exercise_id')::int,
          v_block,
          v_cycle_legacy,
          NULLIF(v_exercise->>'sets', '')::int,
          NULLIF(v_exercise->>'reps', '')::int,
          NULLIF(v_exercise->>'intensity_pct_1rm', '')::double precision,
          NULLIF(v_exercise->>'rest_seconds', '')::int,
          NULL,
          NULLIF(v_exercise->>'intention', ''),
          jsonb_build_object(
            'engine_source',        'mesocycle',
            'mesocycle_id',         v_mesocycle_id,
            'periodization_cycle',  v_cycle,
            'bucket',               v_exercise->>'bucket',
            'is_core',              COALESCE((v_exercise->>'is_core')::boolean, false),
            'intention',            v_exercise->>'intention',
            'substituted',          COALESCE((v_exercise->>'substituted')::boolean, false),
            'original_exercise_id', NULLIF(v_exercise->>'original_exercise_id', '')::int,
            'week_number',          v_week_number,
            'session_number',       v_session_number
          )
        );
      END LOOP;

      -- 5c. Upsert slot override
      INSERT INTO strength_planning_slot_overrides (
        athlete_id, week_start, day_of_week, time_slot,
        session_template_id, notes
      )
      VALUES (
        p_athlete_id, v_week_start, v_day_of_week, 'evening',
        v_template_id,
        format('Mésocycle %s · S%s J%s',
          v_short_id, v_week_number, v_session_number)
      )
      ON CONFLICT (athlete_id, week_start, day_of_week, time_slot) DO UPDATE
        SET session_template_id = EXCLUDED.session_template_id,
            notes               = EXCLUDED.notes;
    END LOOP;
  END LOOP;

  -- ── 7. Notification to the coach (via the athlete's group) ───────────
  SELECT u.name INTO v_athlete_name FROM users u WHERE u.id = p_athlete_id;
  SELECT gm.group_id INTO v_athlete_group_id
    FROM group_members gm
   WHERE gm.user_id = p_athlete_id
   ORDER BY gm.joined_at DESC
   LIMIT 1;

  INSERT INTO notifications (title, body, type, created_by, metadata)
  VALUES (
    'Nouveau mésocycle muscu',
    format('%s a généré un mésocycle de %s semaines (%s).',
      COALESCE(v_athlete_name, 'Un nageur'),
      p_target_week_count,
      p_event_group),
    'message',
    p_athlete_id,
    jsonb_build_object(
      'kind',          'strength_mesocycle_generated',
      'mesocycle_id', v_mesocycle_id,
      'athlete_id',   p_athlete_id,
      'target_role',  'coach'
    )
  )
  RETURNING id INTO v_notification_id;

  IF v_athlete_group_id IS NOT NULL THEN
    INSERT INTO notification_targets (notification_id, target_group_id)
    VALUES (v_notification_id, v_athlete_group_id);
  ELSE
    -- Fallback : pas de groupe → cible le nageur lui-même.
    INSERT INTO notification_targets (notification_id, target_user_id)
    VALUES (v_notification_id, p_athlete_id);
  END IF;

  RETURN v_mesocycle_id;
END;
$$;

GRANT EXECUTE ON FUNCTION apply_strength_mesocycle(
  integer, uuid, uuid, text, text, integer, integer, date, jsonb, text, jsonb
) TO authenticated;

COMMENT ON FUNCTION apply_strength_mesocycle(
  integer, uuid, uuid, text, text, integer, integer, date, jsonb, text, jsonb
) IS '§293 — Matérialise un GeneratedMesocycle sur strength_planning_*. SECURITY DEFINER : vérifie app_user_id()=athlete OU coach/admin. Snapshot des overrides en fenêtre, supersede des actifs précédents, INSERT mesocycle/snapshot/templates/items/overrides, notification coach.';

COMMIT;
