-- 00162_training_plans.sql
-- §275.1 — Nouveau modèle de plans d'entraînement génériques.
--
-- Sépare la NOTION DE PLAN (template multi-semaines réutilisable) du
-- SCHEDULING EFFECTIF (slots semaine-par-semaine, géré par
-- strength_planning_slots). Un coach peut :
--   1. Créer un plan brouillon (is_draft=true) en éditant une grille
--      num_weeks × 7 jours, chaque cellule = session_template_id.
--   2. Publier le plan (is_draft=false) → visible par les autres coachs.
--   3. Appliquer le plan à un nageur ou groupe via training_plan_applications
--      en fixant une start_date (lundi de la semaine 1 du plan).
--
-- La dérivation Planning timeline est faite en TS côté client :
--   relative_week = floor((week_monday - app.start_date) / 7) + 1
--   if (relative_week ∈ [1, num_weeks]) → session = sessions[relative_week][day_of_week]
--
-- Discipline: 'strength' aujourd'hui, extensible à 'swim' plus tard.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- training_plans : template générique multi-semaines
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE training_plans (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  discipline   TEXT NOT NULL DEFAULT 'strength'
                 CHECK (discipline IN ('strength', 'swim')),
  owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  num_weeks    INTEGER NOT NULL CHECK (num_weeks > 0 AND num_weeks <= 104),
  is_draft     BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX training_plans_owner_idx ON training_plans (owner_id);
CREATE INDEX training_plans_discipline_idx ON training_plans (discipline) WHERE is_draft = false;

-- ────────────────────────────────────────────────────────────────────────
-- training_plan_sessions : grille (relative_week, day_of_week) → session
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE training_plan_sessions (
  id                   SERIAL PRIMARY KEY,
  plan_id              INTEGER NOT NULL
                         REFERENCES training_plans(id) ON DELETE CASCADE,
  relative_week        INTEGER NOT NULL CHECK (relative_week >= 1),
  day_of_week          INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  -- Strength sessions today; nullable so we can also represent rest days
  -- (= row exists with notes only, e.g. "Repos actif").
  session_template_id  INTEGER REFERENCES strength_sessions(id) ON DELETE SET NULL,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, relative_week, day_of_week)
);

CREATE INDEX training_plan_sessions_plan_idx ON training_plan_sessions (plan_id);
CREATE INDEX training_plan_sessions_template_idx
  ON training_plan_sessions (session_template_id)
  WHERE session_template_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────
-- training_plan_applications : un plan appliqué à un nageur OU un groupe
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE training_plan_applications (
  id                SERIAL PRIMARY KEY,
  plan_id           INTEGER NOT NULL
                      REFERENCES training_plans(id) ON DELETE CASCADE,
  target_user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  target_group_id   INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  start_date        DATE NOT NULL,
  end_date          DATE,                    -- optional override pour terminer plus tôt
  applied_by        INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- XOR : exactement un des deux targets doit être renseigné
  CONSTRAINT target_xor CHECK (
    (target_user_id IS NULL) <> (target_group_id IS NULL)
  ),
  -- start_date doit être un lundi (ISO day-of-week = 1)
  CONSTRAINT start_date_is_monday CHECK (
    EXTRACT(ISODOW FROM start_date) = 1
  )
);

CREATE INDEX training_plan_apps_plan_idx ON training_plan_applications (plan_id);
CREATE INDEX training_plan_apps_target_user_idx
  ON training_plan_applications (target_user_id) WHERE target_user_id IS NOT NULL;
CREATE INDEX training_plan_apps_target_group_idx
  ON training_plan_applications (target_group_id) WHERE target_group_id IS NOT NULL;
CREATE INDEX training_plan_apps_window_idx
  ON training_plan_applications (start_date, end_date);

-- ────────────────────────────────────────────────────────────────────────
-- updated_at trigger (réutilise la fonction set_updated_at si présente)
-- ────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at_timestamp'
  ) THEN
    CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
    RETURNS TRIGGER AS $body$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $body$ LANGUAGE plpgsql;
  END IF;
END$$;

CREATE TRIGGER training_plans_set_updated_at
  BEFORE UPDATE ON training_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER training_plan_sessions_set_updated_at
  BEFORE UPDATE ON training_plan_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER training_plan_apps_set_updated_at
  BEFORE UPDATE ON training_plan_applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

-- ────────────────────────────────────────────────────────────────────────
-- RLS — training_plans
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE training_plans ENABLE ROW LEVEL SECURITY;

-- Lecture : owner toujours, autres rôles coach/admin si publié (non-brouillon).
-- Les athlètes lisent indirectement via les applications les ciblant
-- (jointure côté client / RPC).
CREATE POLICY training_plans_select ON training_plans
  FOR SELECT TO authenticated
  USING (
    owner_id = app_user_id()
    OR app_user_role() = 'admin'
    OR (NOT is_draft AND app_user_role() = 'coach')
  );

CREATE POLICY training_plans_insert ON training_plans
  FOR INSERT TO authenticated
  WITH CHECK (
    app_user_role() IN ('coach', 'admin')
    AND owner_id = app_user_id()
  );

CREATE POLICY training_plans_update ON training_plans
  FOR UPDATE TO authenticated
  USING (
    app_user_role() = 'admin'
    OR owner_id = app_user_id()
  )
  WITH CHECK (
    app_user_role() = 'admin'
    OR owner_id = app_user_id()
  );

CREATE POLICY training_plans_delete ON training_plans
  FOR DELETE TO authenticated
  USING (
    app_user_role() = 'admin'
    OR owner_id = app_user_id()
  );

-- ────────────────────────────────────────────────────────────────────────
-- RLS — training_plan_sessions
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE training_plan_sessions ENABLE ROW LEVEL SECURITY;

-- Lecture suit le plan parent (réutilise la policy ci-dessus via EXISTS).
CREATE POLICY training_plan_sessions_select ON training_plan_sessions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM training_plans p
      WHERE p.id = training_plan_sessions.plan_id
        AND (
          p.owner_id = app_user_id()
          OR app_user_role() = 'admin'
          OR (NOT p.is_draft AND app_user_role() = 'coach')
          -- Athlètes ciblés par une application active du plan
          OR EXISTS (
            SELECT 1 FROM training_plan_applications a
            WHERE a.plan_id = p.id
              AND a.target_user_id = app_user_id()
          )
          OR EXISTS (
            SELECT 1 FROM training_plan_applications a
            JOIN group_members gm ON gm.group_id = a.target_group_id
            WHERE a.plan_id = p.id
              AND gm.user_id = app_user_id()
          )
        )
    )
  );

CREATE POLICY training_plan_sessions_write ON training_plan_sessions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM training_plans p
      WHERE p.id = training_plan_sessions.plan_id
        AND (p.owner_id = app_user_id() OR app_user_role() = 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM training_plans p
      WHERE p.id = training_plan_sessions.plan_id
        AND (p.owner_id = app_user_id() OR app_user_role() = 'admin')
    )
  );

-- ────────────────────────────────────────────────────────────────────────
-- RLS — training_plan_applications
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE training_plan_applications ENABLE ROW LEVEL SECURITY;

-- Lecture : coachs/admin voient tout ; athlète voit ce qui le cible directement
-- ou via son groupe.
CREATE POLICY training_plan_apps_select ON training_plan_applications
  FOR SELECT TO authenticated
  USING (
    app_user_role() IN ('coach', 'admin')
    OR target_user_id = app_user_id()
    OR EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = training_plan_applications.target_group_id
        AND gm.user_id = app_user_id()
    )
  );

CREATE POLICY training_plan_apps_insert ON training_plan_applications
  FOR INSERT TO authenticated
  WITH CHECK (
    app_user_role() IN ('coach', 'admin')
    AND applied_by = app_user_id()
  );

CREATE POLICY training_plan_apps_update ON training_plan_applications
  FOR UPDATE TO authenticated
  USING (
    app_user_role() = 'admin'
    OR (app_user_role() = 'coach' AND applied_by = app_user_id())
  )
  WITH CHECK (
    app_user_role() = 'admin'
    OR (app_user_role() = 'coach' AND applied_by = app_user_id())
  );

CREATE POLICY training_plan_apps_delete ON training_plan_applications
  FOR DELETE TO authenticated
  USING (
    app_user_role() = 'admin'
    OR (app_user_role() = 'coach' AND applied_by = app_user_id())
  );

COMMIT;
