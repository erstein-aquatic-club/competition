-- =============================================================================
-- Migration 00136: Strength planning slots — group + per-athlete overrides
-- Mirror of swim_planning_* (migrations 00071 + 00131).
-- Links a (group, week, day, time_slot) to a strength_session_templates.id.
-- =============================================================================

-- 1. Group-level slots
CREATE TABLE IF NOT EXISTS strength_planning_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id integer NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  time_slot text NOT NULL CHECK (time_slot IN ('morning', 'evening')),
  session_template_id integer NULL REFERENCES strength_sessions(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, week_start, day_of_week, time_slot)
);

CREATE INDEX idx_strength_planning_slots_group_week
  ON strength_planning_slots(group_id, week_start);

-- 2. Per-athlete slot overrides
CREATE TABLE IF NOT EXISTS strength_planning_slot_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  time_slot text NOT NULL CHECK (time_slot IN ('morning', 'evening')),
  session_template_id integer NULL REFERENCES strength_sessions(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(athlete_id, week_start, day_of_week, time_slot)
);

CREATE INDEX idx_strength_planning_slot_overrides_athlete_week
  ON strength_planning_slot_overrides(athlete_id, week_start);

-- 3. Group-level week meta (week_type, notes)
CREATE TABLE IF NOT EXISTS strength_planning_week_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id integer NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_type text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, week_start)
);

CREATE INDEX idx_strength_planning_week_meta_group_week
  ON strength_planning_week_meta(group_id, week_start);

-- 4. Per-athlete week meta overrides
CREATE TABLE IF NOT EXISTS strength_planning_week_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_type text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(athlete_id, week_start)
);

CREATE INDEX idx_strength_planning_week_overrides_athlete_week
  ON strength_planning_week_overrides(athlete_id, week_start);

-- =============================================================================
-- RLS (mirror swim_planning_* §124 — wrap (SELECT app_user_role()))
-- =============================================================================

ALTER TABLE strength_planning_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE strength_planning_slot_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE strength_planning_week_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE strength_planning_week_overrides ENABLE ROW LEVEL SECURITY;

-- strength_planning_slots
CREATE POLICY strength_planning_slots_select ON strength_planning_slots
  FOR SELECT TO authenticated USING (true);
CREATE POLICY strength_planning_slots_insert ON strength_planning_slots
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY strength_planning_slots_update ON strength_planning_slots
  FOR UPDATE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY strength_planning_slots_delete ON strength_planning_slots
  FOR DELETE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));

-- strength_planning_slot_overrides
CREATE POLICY strength_planning_slot_overrides_select ON strength_planning_slot_overrides
  FOR SELECT TO authenticated USING (true);
CREATE POLICY strength_planning_slot_overrides_insert ON strength_planning_slot_overrides
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY strength_planning_slot_overrides_update ON strength_planning_slot_overrides
  FOR UPDATE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY strength_planning_slot_overrides_delete ON strength_planning_slot_overrides
  FOR DELETE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));

-- strength_planning_week_meta
CREATE POLICY strength_planning_week_meta_select ON strength_planning_week_meta
  FOR SELECT TO authenticated USING (true);
CREATE POLICY strength_planning_week_meta_insert ON strength_planning_week_meta
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY strength_planning_week_meta_update ON strength_planning_week_meta
  FOR UPDATE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY strength_planning_week_meta_delete ON strength_planning_week_meta
  FOR DELETE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));

-- strength_planning_week_overrides
CREATE POLICY strength_planning_week_overrides_select ON strength_planning_week_overrides
  FOR SELECT TO authenticated USING (true);
CREATE POLICY strength_planning_week_overrides_insert ON strength_planning_week_overrides
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY strength_planning_week_overrides_update ON strength_planning_week_overrides
  FOR UPDATE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY strength_planning_week_overrides_delete ON strength_planning_week_overrides
  FOR DELETE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));

-- =============================================================================
-- BACKFILL: cycles existants (per-athlete) → strength_planning_slot_overrides
-- =============================================================================
-- Parse "SNN-SMM" ou "SNN" dans le nom du cycle, explose en weeks ISO,
-- map les session_templates par préfixe jour (Lun/Mar/Mer/Jeu/Ven/Sam/Dim),
-- insère dans slot_overrides avec time_slot='evening' (convention muscu).
-- Les cycles sans préfixe jour ou parsing impossible sont ignorés (logged).
--
-- Pour garder la migration SQL idempotente et évitée d'embarquer du code
-- procédural complexe, on délègue le backfill à une fonction plpgsql dédiée
-- qu'on exécute UNE fois. Si le backfill échoue (cas exotique), le coach
-- recréera via l'éditeur Phase 3.

DO $$
DECLARE
  r record;
  week_num int;
  start_num int;
  end_num int;
  cur_year int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  week_monday date;
  day_idx int;
  session_rec record;
BEGIN
  -- Boucle sur chaque cycle per-athlete ayant des session templates
  FOR r IN
    SELECT
      sf.id as cycle_id,
      sf.name as cycle_name,
      sfp.athlete_id,
      substring(sf.name from '^S([0-9]+)') as start_s,
      substring(sf.name from '^S[0-9]+-S([0-9]+)') as end_s
    FROM strength_folders sf
    JOIN strength_folders sfp ON sfp.id = sf.parent_id
    WHERE sfp.athlete_id IS NOT NULL
      AND sf.name ~ '^S[0-9]+'
  LOOP
    start_num := COALESCE(r.start_s::int, 0);
    end_num := COALESCE(r.end_s::int, start_num);
    IF start_num = 0 THEN CONTINUE; END IF;

    FOR week_num IN start_num..end_num LOOP
      -- Monday of ISO week week_num in cur_year
      week_monday := (date_trunc('week',
        to_date(cur_year::text || '-W' || lpad(week_num::text, 2, '0') || '-1',
                'IYYY-"W"IW-ID')))::date;

      -- Session par préfixe jour
      FOR session_rec IN
        SELECT id, title,
          CASE
            WHEN title ~* '^lun' THEN 0
            WHEN title ~* '^mar' THEN 1
            WHEN title ~* '^mer' THEN 2
            WHEN title ~* '^jeu' THEN 3
            WHEN title ~* '^ven' THEN 4
            WHEN title ~* '^sam' THEN 5
            WHEN title ~* '^dim' THEN 6
            ELSE -1
          END as dow
        FROM strength_sessions
        WHERE folder_id = r.cycle_id
      LOOP
        IF session_rec.dow = -1 THEN CONTINUE; END IF;
        INSERT INTO strength_planning_slot_overrides
          (athlete_id, week_start, day_of_week, time_slot, session_template_id)
        VALUES
          (r.athlete_id, week_monday, session_rec.dow, 'evening', session_rec.id)
        ON CONFLICT (athlete_id, week_start, day_of_week, time_slot) DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
