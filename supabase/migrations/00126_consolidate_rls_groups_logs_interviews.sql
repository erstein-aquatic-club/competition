-- Consolidation RLS : groups / swim_exercise_logs / interviews
-- Objectif : -60 warnings multiple_permissive_policies (24 + 24 + 12).
--
-- Pattern : fusionner les policies PERMISSIVE qui se chevauchent par action
-- en UNE policy par action avec conditions combinées via OR.
-- Scoper à TO authenticated (ces tables ne sont jamais accédées en anon).

-- =============================================================================
-- groups : 24 warnings (4 actions × 6 rôles)
-- Cause : groups_write (ALL) + groups_select/insert/update/delete
-- Fix : supprimer groups_write, garder les 4 policies per-action
-- =============================================================================

DROP POLICY IF EXISTS "groups_write" ON groups;
DROP POLICY IF EXISTS "groups_select" ON groups;
DROP POLICY IF EXISTS "groups_insert" ON groups;
DROP POLICY IF EXISTS "groups_update" ON groups;
DROP POLICY IF EXISTS "groups_delete" ON groups;

CREATE POLICY "groups_select"
  ON groups FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "groups_insert"
  ON groups FOR INSERT
  TO authenticated
  WITH CHECK (
    app_user_role() IN ('admin', 'coach')
    AND is_temporary = true
  );

CREATE POLICY "groups_update"
  ON groups FOR UPDATE
  TO authenticated
  USING (
    app_user_role() IN ('admin', 'coach')
    AND is_temporary = true
  )
  WITH CHECK (
    app_user_role() IN ('admin', 'coach')
    AND is_temporary = true
  );

CREATE POLICY "groups_delete"
  ON groups FOR DELETE
  TO authenticated
  USING (
    app_user_role() IN ('admin', 'coach')
    AND is_temporary = true
  );

-- =============================================================================
-- swim_exercise_logs : 24 warnings (4 actions × 6 rôles)
-- Cause : "Users manage own exercise logs" (ALL, user_id=auth.uid) + 4 policies coach
-- Fix : splitter en 4 policies per-action, chacune combinant user + coach via OR
-- =============================================================================

DROP POLICY IF EXISTS "Users manage own exercise logs" ON swim_exercise_logs;
DROP POLICY IF EXISTS "Coaches view all exercise logs" ON swim_exercise_logs;
DROP POLICY IF EXISTS "Coaches insert exercise logs for athletes" ON swim_exercise_logs;
DROP POLICY IF EXISTS "Coaches manage exercise logs" ON swim_exercise_logs;
DROP POLICY IF EXISTS "Coaches delete exercise logs" ON swim_exercise_logs;

CREATE POLICY "swim_exercise_logs_select"
  ON swim_exercise_logs FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR app_user_role() IN ('coach', 'admin')
  );

CREATE POLICY "swim_exercise_logs_insert"
  ON swim_exercise_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR app_user_role() IN ('coach', 'admin')
  );

CREATE POLICY "swim_exercise_logs_update"
  ON swim_exercise_logs FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR app_user_role() IN ('coach', 'admin')
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR app_user_role() IN ('coach', 'admin')
  );

CREATE POLICY "swim_exercise_logs_delete"
  ON swim_exercise_logs FOR DELETE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR app_user_role() IN ('coach', 'admin')
  );

-- =============================================================================
-- interviews : 12 warnings (2 actions SELECT+UPDATE × 6 rôles)
-- Cause : interviews_athlete_select + interviews_coach_select (même cmd, overlap)
--         interviews_athlete_update + interviews_coach_update (idem)
-- Fix : fusionner en 1 policy par action via OR. INSERT et DELETE restent séparés
--       (pas d'overlap : seul le coach peut insert/delete).
--
-- IMPORTANT : préserver la logique stateful (status gate athlete, coach_swimmer_assignments)
-- Tests RLS supabase/tests/rls/interviews.test.ts (17 assertions) doivent tous passer.
-- =============================================================================

DROP POLICY IF EXISTS "interviews_athlete_select" ON interviews;
DROP POLICY IF EXISTS "interviews_coach_select" ON interviews;
DROP POLICY IF EXISTS "interviews_athlete_update" ON interviews;
DROP POLICY IF EXISTS "interviews_coach_update" ON interviews;
DROP POLICY IF EXISTS "interviews_coach_insert" ON interviews;
DROP POLICY IF EXISTS "interviews_coach_delete" ON interviews;

-- SELECT : union athlete (status gate) + coach (admin OR created_by OR assigned)
CREATE POLICY "interviews_select"
  ON interviews FOR SELECT
  TO authenticated
  USING (
    -- Branche athlete : status gate
    (
      app_user_role() = 'athlete'
      AND athlete_id = app_user_id()
      AND status = ANY (ARRAY['draft_athlete','draft_coach','sent','signed'])
    )
    OR
    -- Branche coach/admin
    (
      app_user_role() = 'admin'
      OR (
        app_user_role() = 'coach'
        AND (
          created_by = (SELECT auth.uid())
          OR athlete_id IN (
            SELECT coach_swimmer_assignments.swimmer_id
            FROM coach_swimmer_assignments
            WHERE coach_swimmer_assignments.coach_id = app_user_id()
          )
        )
      )
    )
  );

-- UPDATE : asymétrie USING / WITH CHECK préservée pour la branche athlete
CREATE POLICY "interviews_update"
  ON interviews FOR UPDATE
  TO authenticated
  USING (
    -- Branche athlete : USING tighter (only draft_athlete or sent)
    (
      app_user_role() = 'athlete'
      AND athlete_id = app_user_id()
      AND status = ANY (ARRAY['draft_athlete','sent'])
    )
    OR
    -- Branche coach/admin
    (
      app_user_role() = 'admin'
      OR (
        app_user_role() = 'coach'
        AND (
          created_by = (SELECT auth.uid())
          OR athlete_id IN (
            SELECT coach_swimmer_assignments.swimmer_id
            FROM coach_swimmer_assignments
            WHERE coach_swimmer_assignments.coach_id = app_user_id()
          )
        )
      )
    )
  )
  WITH CHECK (
    -- Branche athlete : WITH CHECK wider (4 statuses allowed)
    (
      app_user_role() = 'athlete'
      AND athlete_id = app_user_id()
      AND status = ANY (ARRAY['draft_athlete','draft_coach','sent','signed'])
    )
    OR
    -- Branche coach/admin (pas de WITH CHECK dans original, on garde la même condition que USING)
    (
      app_user_role() = 'admin'
      OR (
        app_user_role() = 'coach'
        AND (
          created_by = (SELECT auth.uid())
          OR athlete_id IN (
            SELECT coach_swimmer_assignments.swimmer_id
            FROM coach_swimmer_assignments
            WHERE coach_swimmer_assignments.coach_id = app_user_id()
          )
        )
      )
    )
  );

-- INSERT : coach/admin uniquement (pas d'athlete_insert → pas d'overlap)
CREATE POLICY "interviews_insert"
  ON interviews FOR INSERT
  TO authenticated
  WITH CHECK (
    app_user_role() IN ('admin', 'coach')
  );

-- DELETE : coach créateur ou admin (pas d'athlete_delete → pas d'overlap)
CREATE POLICY "interviews_delete"
  ON interviews FOR DELETE
  TO authenticated
  USING (
    app_user_role() = 'admin'
    OR (
      app_user_role() = 'coach'
      AND created_by = (SELECT auth.uid())
    )
  );
