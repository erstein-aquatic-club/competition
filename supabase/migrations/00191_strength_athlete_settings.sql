-- 00191_strength_athlete_settings.sql
-- Dé-jeunification moteur muscu (G1+G3) : niveau de pratique muscu (filtre
-- exercices) + tier de performance (cale les barèmes KPI), coach-set, par
-- athlète. 1 ligne / athlète (PK athlete_id). Défauts applicatifs : NULL →
-- 'intermediate' (niveau) / 'club' (tier, = identité barème).
--
-- Design : docs/plans/2026-05-24-muscu-dejeunification-g1-g3-design.md
-- RLS : athlète en LECTURE SEULE de sa ligne (les niveaux sont coach-set) ;
-- coach/admin lecture + écriture club-wide (même modèle que strength_assessments
-- en 00163). Helpers app_user_id()/app_user_role() (pas auth.uid()).

BEGIN;

CREATE TABLE strength_athlete_settings (
  athlete_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  practice_level    TEXT CHECK (practice_level IN ('beginner','intermediate','advanced')),
  performance_tier  TEXT CHECK (performance_tier IN ('club','regional','national','elite')),
  updated_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER strength_athlete_settings_set_updated_at
  BEFORE UPDATE ON strength_athlete_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

ALTER TABLE strength_athlete_settings ENABLE ROW LEVEL SECURITY;

-- Athlète : lecture seule de sa ligne (les niveaux sont coach-set).
CREATE POLICY strength_athlete_settings_own_read ON strength_athlete_settings
  FOR SELECT TO authenticated
  USING (athlete_id = app_user_id());

-- Coach / admin : lecture + écriture club-wide.
CREATE POLICY strength_athlete_settings_coach ON strength_athlete_settings
  FOR ALL TO authenticated
  USING (app_user_role() IN ('coach','admin'))
  WITH CHECK (app_user_role() IN ('coach','admin'));

COMMIT;
