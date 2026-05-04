-- §193 — Many-to-many objectives ↔ competitions
--
-- Avant : objectives.competition_id (NULLable, 1:1) — un objectif est lié
-- à au plus une compétition.
-- Après : NEW table objective_competitions (N:N) — un objectif peut être
-- rattaché à plusieurs compétitions. La colonne objectives.competition_id
-- est conservée pour back-compat (les API la rempliront avec la première
-- entrée du join lors des SELECT) mais n'est plus écrite par les nouveaux
-- INSERT/UPDATE côté front.

CREATE TABLE IF NOT EXISTS objective_competitions (
  objective_id UUID NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (objective_id, competition_id)
);

CREATE INDEX IF NOT EXISTS idx_objective_competitions_competition_id
  ON objective_competitions(competition_id);

ALTER TABLE objective_competitions ENABLE ROW LEVEL SECURITY;

-- SELECT : un nageur voit les liens de ses propres objectifs ; coach/admin voient tout.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'objective_competitions_select') THEN
    CREATE POLICY objective_competitions_select ON objective_competitions FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM objectives o
          WHERE o.id = objective_competitions.objective_id
            AND (o.athlete_id = auth.uid() OR app_user_role() IN ('admin','coach','committee'))
        )
      );
  END IF;
END $$;

-- INSERT/UPDATE/DELETE : nageur sur ses propres objectifs ; coach/admin sur tous.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'objective_competitions_write') THEN
    CREATE POLICY objective_competitions_write ON objective_competitions FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM objectives o
          WHERE o.id = objective_competitions.objective_id
            AND (app_user_role() IN ('admin','coach') OR o.athlete_id = auth.uid())
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM objectives o
          WHERE o.id = objective_competitions.objective_id
            AND (app_user_role() IN ('admin','coach') OR o.athlete_id = auth.uid())
        )
      );
  END IF;
END $$;

-- Backfill : pour chaque objectif avec competition_id non null, créer le lien
-- correspondant dans la table de jointure (idempotent grâce au PK + ON CONFLICT).
INSERT INTO objective_competitions (objective_id, competition_id, created_at)
SELECT id, competition_id, COALESCE(created_at, now())
FROM objectives
WHERE competition_id IS NOT NULL
ON CONFLICT (objective_id, competition_id) DO NOTHING;

-- Note : on ne supprime PAS la colonne objectives.competition_id pour cette
-- migration (back-compat). Une migration future pourra la dropper une fois
-- toutes les API basculées sur le join et les call sites front-end migrés.
