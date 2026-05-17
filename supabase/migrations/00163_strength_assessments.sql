-- 00163_strength_assessments.sql
-- §285 — Chantier B "Bilan Muscu → Mésocycle" : tables d'évaluation.
-- Design : docs/plans/2026-05-17-bilan-muscu-mesocycle-design.md
--
-- strength_assessments      : un bilan par nageur (questionnaire nageur +
--                             bilan mobilité/mouvement coach + scoring seaux).
-- strength_kpi_measurements : série temporelle des 5 KPIs du wizard.
--
-- RLS : calquée sur pain_reports (00068) — le nageur possède ses lignes,
-- coach/admin lisent ET écrivent (le coach renseigne physical_tests / valide
-- les mesures KPI).

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- strength_assessments
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE strength_assessments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'questionnaire_pending'
                     CHECK (status IN ('questionnaire_pending','bilan_pending','completed')),
  questionnaire    JSONB,
  physical_tests   JSONB,
  bucket_scores    JSONB,
  data_confidence  TEXT NOT NULL DEFAULT 'full'
                     CHECK (data_confidence IN ('full','partial','low')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX strength_assessments_athlete_idx
  ON strength_assessments (athlete_id, created_at DESC);

-- ────────────────────────────────────────────────────────────────────────
-- strength_kpi_measurements
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE strength_kpi_measurements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kpi_key         TEXT NOT NULL CHECK (kpi_key IN (
                    'vertical_jump','broad_jump','imtp',
                    'weighted_pullup','medball_vertical_throw')),
  value           NUMERIC NOT NULL CHECK (value >= 0),
  unit            TEXT NOT NULL,
  attempts        JSONB,
  measured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  measured_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assisted_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  source          TEXT NOT NULL CHECK (source IN ('wizard_athlete','wizard_coach')),
  coach_reviewed  BOOLEAN NOT NULL DEFAULT false,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX strength_kpi_measurements_athlete_idx
  ON strength_kpi_measurements (athlete_id, kpi_key, measured_at DESC);

-- ────────────────────────────────────────────────────────────────────────
-- updated_at trigger (réutilise set_updated_at_timestamp, créée en 00162)
-- ────────────────────────────────────────────────────────────────────────
CREATE TRIGGER strength_assessments_set_updated_at
  BEFORE UPDATE ON strength_assessments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

-- ────────────────────────────────────────────────────────────────────────
-- RLS — strength_assessments
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE strength_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY strength_assessments_own ON strength_assessments
  FOR ALL TO authenticated
  USING (athlete_id = app_user_id())
  WITH CHECK (athlete_id = app_user_id());

CREATE POLICY strength_assessments_coach ON strength_assessments
  FOR ALL TO authenticated
  USING (app_user_role() IN ('coach','admin'))
  WITH CHECK (app_user_role() IN ('coach','admin'));

-- ────────────────────────────────────────────────────────────────────────
-- RLS — strength_kpi_measurements
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE strength_kpi_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY strength_kpi_measurements_own ON strength_kpi_measurements
  FOR ALL TO authenticated
  USING (athlete_id = app_user_id())
  WITH CHECK (athlete_id = app_user_id());

CREATE POLICY strength_kpi_measurements_coach ON strength_kpi_measurements
  FOR ALL TO authenticated
  USING (app_user_role() IN ('coach','admin'))
  WITH CHECK (app_user_role() IN ('coach','admin'));

COMMIT;
