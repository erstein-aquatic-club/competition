-- 00170_strength_mesocycles.sql
-- §293 — Chantier C+D "Moteur de génération du mésocycle" : tables de persistance.
-- Design : docs/plans/2026-05-18-bilan-muscu-moteur-generation-design.md §6
--
-- strength_mesocycles          : un mésocycle généré par le moteur déterministe.
--                               Un nageur peut en avoir plusieurs successifs ;
--                               `status` indique lequel est actif (active|reverted|superseded).
-- strength_planning_snapshots  : filet de sécurité — copie des overrides de planning
--                               avant que le mésocycle soit matérialisé (revert possible).
--
-- FK types (vérifiés sur les migrations prod) :
--   users.id                               = INTEGER (SERIAL)
--   strength_assessments.id                = UUID
--   strength_periodization_templates.id    = UUID
--
-- RLS :
--   nageur   → lit/écrit SES lignes (athlete_id = app_user_id())
--   coach    → SELECT sur les nageurs qui lui sont assignés (coach_swimmer_assignments)
--              INSERT/UPDATE pour coach/admin (accès club entier, même modèle que strength_assessments)
--   admin    → accès complet (FOR ALL)
--
-- Trigger updated_at : réutilise set_updated_at_timestamp() (créée en 00162).

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- strength_mesocycles
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE strength_mesocycles (
  id                UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id        INTEGER    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assessment_id     UUID       NOT NULL REFERENCES strength_assessments(id) ON DELETE RESTRICT,
  template_id       UUID       NOT NULL REFERENCES strength_periodization_templates(id) ON DELETE RESTRICT,
  event_group       TEXT       NOT NULL,
  kind              TEXT       NOT NULL CHECK (kind IN ('season','inter_competition')),
  target_week_count INTEGER    NOT NULL CHECK (target_week_count > 0),
  sessions_per_week INTEGER    NOT NULL CHECK (sessions_per_week >= 1 AND sessions_per_week <= 7),
  status            TEXT       NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active','reverted','superseded')),
  bucket_priorities JSONB,
  engine_version    TEXT       NOT NULL,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by      INTEGER    REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX strength_mesocycles_athlete_idx
  ON strength_mesocycles (athlete_id, created_at DESC);

CREATE INDEX strength_mesocycles_status_idx
  ON strength_mesocycles (athlete_id, status)
  WHERE status = 'active';

-- Trigger updated_at (réutilise set_updated_at_timestamp créée en 00162)
CREATE TRIGGER strength_mesocycles_set_updated_at
  BEFORE UPDATE ON strength_mesocycles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

-- ────────────────────────────────────────────────────────────────────────
-- strength_planning_snapshots
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE strength_planning_snapshots (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mesocycle_id    UUID        NOT NULL REFERENCES strength_mesocycles(id) ON DELETE CASCADE,
  athlete_id      INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot_overrides  JSONB,
  week_overrides  JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX strength_planning_snapshots_mesocycle_idx
  ON strength_planning_snapshots (mesocycle_id);

CREATE INDEX strength_planning_snapshots_athlete_idx
  ON strength_planning_snapshots (athlete_id, created_at DESC);

-- ────────────────────────────────────────────────────────────────────────
-- RLS — strength_mesocycles
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE strength_mesocycles ENABLE ROW LEVEL SECURITY;

-- Nageur : lit et écrit SES propres mésocycles
CREATE POLICY strength_mesocycles_own ON strength_mesocycles
  FOR ALL TO authenticated
  USING (athlete_id = app_user_id())
  WITH CHECK (athlete_id = app_user_id());

-- Coach : SELECT uniquement sur les mésocycles des nageurs qui lui sont assignés
CREATE POLICY strength_mesocycles_coach_select ON strength_mesocycles
  FOR SELECT TO authenticated
  USING (
    app_user_role() = 'coach'
    AND athlete_id IN (
      SELECT swimmer_id FROM coach_swimmer_assignments
      WHERE coach_id = app_user_id()
    )
  );

-- Coach : INSERT/UPDATE sur les nageurs assignés (supervision, ajustements)
CREATE POLICY strength_mesocycles_coach_write ON strength_mesocycles
  FOR ALL TO authenticated
  USING (
    app_user_role() = 'coach'
    AND athlete_id IN (
      SELECT swimmer_id FROM coach_swimmer_assignments
      WHERE coach_id = app_user_id()
    )
  )
  WITH CHECK (
    app_user_role() = 'coach'
    AND athlete_id IN (
      SELECT swimmer_id FROM coach_swimmer_assignments
      WHERE coach_id = app_user_id()
    )
  );

-- Admin : accès complet
CREATE POLICY strength_mesocycles_admin ON strength_mesocycles
  FOR ALL TO authenticated
  USING (app_user_role() = 'admin')
  WITH CHECK (app_user_role() = 'admin');

-- ────────────────────────────────────────────────────────────────────────
-- RLS — strength_planning_snapshots
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE strength_planning_snapshots ENABLE ROW LEVEL SECURITY;

-- Nageur : lit et écrit SES propres snapshots
CREATE POLICY strength_snapshots_own ON strength_planning_snapshots
  FOR ALL TO authenticated
  USING (athlete_id = app_user_id())
  WITH CHECK (athlete_id = app_user_id());

-- Coach : SELECT uniquement sur les snapshots des nageurs assignés
CREATE POLICY strength_snapshots_coach_select ON strength_planning_snapshots
  FOR SELECT TO authenticated
  USING (
    app_user_role() = 'coach'
    AND athlete_id IN (
      SELECT swimmer_id FROM coach_swimmer_assignments
      WHERE coach_id = app_user_id()
    )
  );

-- Coach : INSERT/UPDATE sur les snapshots des nageurs assignés
CREATE POLICY strength_snapshots_coach_write ON strength_planning_snapshots
  FOR ALL TO authenticated
  USING (
    app_user_role() = 'coach'
    AND athlete_id IN (
      SELECT swimmer_id FROM coach_swimmer_assignments
      WHERE coach_id = app_user_id()
    )
  )
  WITH CHECK (
    app_user_role() = 'coach'
    AND athlete_id IN (
      SELECT swimmer_id FROM coach_swimmer_assignments
      WHERE coach_id = app_user_id()
    )
  );

-- Admin : accès complet
CREATE POLICY strength_snapshots_admin ON strength_planning_snapshots
  FOR ALL TO authenticated
  USING (app_user_role() = 'admin')
  WITH CHECK (app_user_role() = 'admin');

COMMIT;
