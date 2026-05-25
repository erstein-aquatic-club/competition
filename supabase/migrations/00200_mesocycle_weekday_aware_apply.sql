-- 00200_mesocycle_weekday_aware_apply.sql
-- §307 — `apply_strength_mesocycle` devient « jour-aware » (amorce PAP).
--
-- Repris de 00181 (noms de sessions lisibles) ; on applique 7 diffs ciblés,
-- tout le reste (auth, supersede, snapshot, insert items, overrides
-- semaine/slot, notification) reste byte-identique.
--
-- Diffs vs 00181 :
--   1. Signature : ajout d'un paramètre TRAILING `p_start_date date DEFAULT NULL`
--      (après `p_weeks`). Le DEFAULT préserve la signature d'appel existante :
--      le frontend prod déployé (qui n'envoie pas ce paramètre) continue de
--      résoudre la fonction sans erreur.
--   2. Date de départ effective : `v_effective_start := COALESCE(p_start_date,
--      p_start_week_monday)` — départ réel, ou lundi semaine 1 en fallback.
--   3. `v_days` (CASE p_sessions_per_week …) CONSERVÉ comme FALLBACK legacy
--      pour les payloads sans `weekday` par séance.
--   4. Source du jour : `v_day_of_week := COALESCE(NULLIF(weekday,'')::int,
--      v_days[v_session_number])` — le moteur jour-aware fournit un weekday
--      par séance ; sinon on retombe sur la carte legacy. Le garde
--      `v_session_number > array_length(v_days,1)` est relâché (on ne saute
--      plus une séance qui porte un weekday valide) ; on garde une garde
--      contre un `v_day_of_week` NULL.
--   5. Première semaine partielle : on calcule la date calendaire de la séance
--      et on l'ignore (CONTINUE) si elle tombe AVANT `v_effective_start` —
--      avant toute création de template/items orphelins.
--   6. Nom role-aware : si `role = 'amorce_pap'`, préfixe le nom calculé par
--      'Amorce SNC · '. 'Mobilité corrective' et le nommage `developpement`
--      restent strictement identiques à aujourd'hui. Un role NULL/absent
--      (= legacy) → nom inchangé.
--   7. Pas de backfill : ce script ne touche QUE la fonction.
--
-- Rétro-compatibilité : payload sans `weekday`/`role` (frontend prod) → fallback
-- `v_days` + nommage 00181 inchangé ; appel sans `p_start_date` → départ = lundi
-- semaine 1, aucune séance écartée.

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
  p_weeks             jsonb,
  p_start_date        date DEFAULT NULL
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
  -- §296 — nouveau format de nom
  v_primary_bucket   text;
  v_complement_bucket text;
  v_session_name     text;
  v_session_desc     text;
  -- §307 — jour-aware
  v_effective_start  date;
  v_role             text;
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

  IF p_target_week_count <= 0 THEN
    RAISE EXCEPTION 'apply_strength_mesocycle: target_week_count must be > 0';
  END IF;
  IF p_sessions_per_week NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'apply_strength_mesocycle: sessions_per_week must be 1..7';
  END IF;

  -- §307 — date de départ effective (départ réel, ou lundi semaine 1 en fallback)
  v_effective_start := COALESCE(p_start_date, p_start_week_monday);

  v_window_end := p_start_week_monday + ((p_target_week_count - 1) * 7);

  -- §307 — carte legacy CONSERVÉE comme fallback (payload sans weekday par séance)
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

      -- §307 — source du jour : weekday par séance (moteur jour-aware) sinon
      -- carte legacy. Garde-fou : on saute uniquement si AUCUN jour résolu.
      v_day_of_week := COALESCE(
        NULLIF(v_session->>'weekday','')::int,   -- new engine: per-session weekday
        v_days[v_session_number]                  -- legacy payload fallback
      );
      IF v_day_of_week IS NULL THEN
        CONTINUE;
      END IF;

      -- §307 — première semaine partielle : ignorer une séance dont la date
      -- calendaire tombe avant la date de départ effective (avant toute
      -- création de template/items orphelins).
      IF (v_week_start + v_day_of_week) < v_effective_start THEN
        CONTINUE;  -- jour avant la date de départ (1re semaine partielle)
      END IF;

      -- §296 — nouveau format de nom : "Force haut + Puissance bas"
      v_primary_bucket    := v_session->'buckets'->>0;
      v_complement_bucket := v_session->'buckets'->>1;
      -- §307 — rôle de la séance (classification jour-aware)
      v_role := v_session->>'role';

      IF v_primary_bucket IS NULL OR v_primary_bucket = 'mobility' THEN
        v_session_name := 'Mobilité corrective';
      ELSE
        v_session_name := CASE v_primary_bucket
          WHEN 'upper_strength' THEN 'Force haut'
          WHEN 'lower_strength' THEN 'Force bas'
          WHEN 'upper_power'    THEN 'Puissance haut'
          WHEN 'lower_power'    THEN 'Puissance bas'
          WHEN 'mobility'       THEN 'Mobilité'
          ELSE v_primary_bucket
        END;

        IF v_complement_bucket IS NOT NULL
           AND v_complement_bucket <> v_primary_bucket
           AND v_complement_bucket <> 'mobility' THEN
          v_session_name := v_session_name || ' + ' || CASE v_complement_bucket
            WHEN 'upper_strength' THEN 'Force haut'
            WHEN 'lower_strength' THEN 'Force bas'
            WHEN 'upper_power'    THEN 'Puissance haut'
            WHEN 'lower_power'    THEN 'Puissance bas'
            WHEN 'mobility'       THEN 'Mobilité'
            ELSE v_complement_bucket
          END;
        END IF;

        -- §307 — préfixe amorce PAP (laisse Mobilité corrective intact ; un
        -- role NULL/absent = legacy = nom inchangé).
        IF v_role = 'amorce_pap' THEN
          v_session_name := 'Amorce SNC · ' || v_session_name;
        END IF;
      END IF;

      v_session_desc := format('[Méso %s] · S%s J%s · %s · engine %s',
        v_short_id,
        lpad(v_week_number::text, 2, '0'),
        v_session_number,
        v_cycle_label,
        p_engine_version);

      -- 5a. Create the session template row
      INSERT INTO strength_sessions (name, description, folder_id, created_by)
      VALUES (v_session_name, v_session_desc, NULL, p_athlete_id)
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
  SELECT u.display_name INTO v_athlete_name FROM users u WHERE u.id = p_athlete_id;
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
    INSERT INTO notification_targets (notification_id, target_user_id)
    VALUES (v_notification_id, p_athlete_id);
  END IF;

  RETURN v_mesocycle_id;
END;
$$;

COMMIT;
