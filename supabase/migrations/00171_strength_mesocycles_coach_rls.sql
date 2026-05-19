-- 00171_strength_mesocycles_coach_rls.sql
-- §293 — Aligne la RLS coach des tables mésocycle sur celle de strength_assessments.
--
-- 00170 scopait l'accès coach aux nageurs de `coach_swimmer_assignments`. Or la
-- table sœur `strength_assessments` (qui porte l'évaluation dont le mésocycle
-- dérive) donne au coach un accès à l'échelle du CLUB
-- (`app_user_role() IN ('coach','admin')`). Un coach qui voit l'évaluation doit
-- voir le mésocycle généré à partir d'elle — sinon la visibilité coach (Phase 6)
-- se brise pour toute relation de coaching hors `coach_swimmer_assignments`.
--
-- On remplace donc les 3 policies coach/admin par une policy `_coach` unique
-- (coach + admin, FOR ALL), strictement calquée sur `strength_assessments`.

BEGIN;

-- ── strength_mesocycles ───────────────────────────────────────────────────
DROP POLICY IF EXISTS strength_mesocycles_coach_select ON strength_mesocycles;
DROP POLICY IF EXISTS strength_mesocycles_coach_write  ON strength_mesocycles;
DROP POLICY IF EXISTS strength_mesocycles_admin        ON strength_mesocycles;

CREATE POLICY strength_mesocycles_coach ON strength_mesocycles
  FOR ALL TO authenticated
  USING (app_user_role() = ANY (ARRAY['coach', 'admin']))
  WITH CHECK (app_user_role() = ANY (ARRAY['coach', 'admin']));

-- ── strength_planning_snapshots ───────────────────────────────────────────
DROP POLICY IF EXISTS strength_snapshots_coach_select ON strength_planning_snapshots;
DROP POLICY IF EXISTS strength_snapshots_coach_write  ON strength_planning_snapshots;
DROP POLICY IF EXISTS strength_snapshots_admin        ON strength_planning_snapshots;

CREATE POLICY strength_snapshots_coach ON strength_planning_snapshots
  FOR ALL TO authenticated
  USING (app_user_role() = ANY (ARRAY['coach', 'admin']))
  WITH CHECK (app_user_role() = ANY (ARRAY['coach', 'admin']));

COMMIT;
