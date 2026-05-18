-- 00168_strength_assessments_sessions_per_week.sql
-- Design : docs/plans/2026-05-18-bilan-muscu-templates-duree-variable-design.md
-- Capacité hebdomadaire de muscu de l'athlète, saisie à l'auto-évaluation
-- (nageur) et ajustable par le coach. Défaut 3 (sourcé Frontiers 2023 :
-- ≥3 séances/sem. chez 83 % des coaches S&C). Aucune policy RLS modifiée.
BEGIN;

ALTER TABLE strength_assessments
  ADD COLUMN sessions_per_week INTEGER NOT NULL DEFAULT 3
    CHECK (sessions_per_week BETWEEN 1 AND 7);

COMMIT;
