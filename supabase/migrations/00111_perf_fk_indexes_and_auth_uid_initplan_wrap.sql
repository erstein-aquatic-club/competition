-- Session 2 — Backend perf
--
-- (1) Ajoute 9 index sur les FK non indexées (advisor unindexed_foreign_keys).
--     Préventif : volumes actuels faibles, gain futur quand les tables croissent.
--
-- (2) Corrige 13 policies RLS qui utilisent `auth.uid()` non wrappé
--     (advisor auth_rls_initplan). Le planner Postgres réévalue auth.uid()
--     par row ; wrapper en `(SELECT auth.uid())` transforme ça en initplan
--     évalué 1 fois par requête. Sémantique identique, gain perf sur tables
--     à volume (objectives, swim_exercise_logs, chrono_records).
--
-- Scope volontairement réduit : pas de merge de policies (interviews, swim_*)
-- ni de drop d'index dead. Ces changements sont reportés à une session
-- dédiée (besoin de tests bout-en-bout).

---------- (1) FK INDEXES -----------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_user_profiles_approved_by
  ON public.user_profiles (approved_by);

CREATE INDEX IF NOT EXISTS idx_competitions_created_by
  ON public.competitions (created_by);

CREATE INDEX IF NOT EXISTS idx_competition_checklist_checks_checklist_item_id
  ON public.competition_checklist_checks (checklist_item_id);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor_id
  ON public.admin_audit_log (actor_id);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target_user_id
  ON public.admin_audit_log (target_user_id);

CREATE INDEX IF NOT EXISTS idx_challenges_coach_id
  ON public.challenges (coach_id);

CREATE INDEX IF NOT EXISTS idx_challenges_group_id
  ON public.challenges (group_id);

CREATE INDEX IF NOT EXISTS idx_coach_comment_reads_session_id
  ON public.coach_comment_reads (session_id);

CREATE INDEX IF NOT EXISTS idx_swim_catalog_folders_created_by
  ON public.swim_catalog_folders (created_by);

---------- (2) AUTH.UID() WRAP ------------------------------------------------
-- Pattern : DROP + CREATE (ALTER POLICY ne permet pas de modifier USING/WITH CHECK).
-- Atomique : si une CREATE échoue, la transaction rollback -> aucune policy perdue.

-- 2.1 chrono_records
DROP POLICY IF EXISTS "Coaches manage own chrono records" ON public.chrono_records;
CREATE POLICY "Coaches manage own chrono records"
  ON public.chrono_records
  AS PERMISSIVE FOR ALL TO public
  USING (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));

-- 2.2 interviews_coach_delete
DROP POLICY IF EXISTS interviews_coach_delete ON public.interviews;
CREATE POLICY interviews_coach_delete
  ON public.interviews
  AS PERMISSIVE FOR DELETE TO public
  USING (
    (app_user_role() = 'admin'::text)
    OR ((app_user_role() = 'coach'::text) AND (created_by = (SELECT auth.uid())))
  );

-- 2.3 interviews_coach_select
DROP POLICY IF EXISTS interviews_coach_select ON public.interviews;
CREATE POLICY interviews_coach_select
  ON public.interviews
  AS PERMISSIVE FOR SELECT TO public
  USING (
    (app_user_role() = 'admin'::text)
    OR (
      (app_user_role() = 'coach'::text)
      AND (
        (created_by = (SELECT auth.uid()))
        OR (athlete_id IN (
          SELECT coach_swimmer_assignments.swimmer_id
          FROM coach_swimmer_assignments
          WHERE coach_swimmer_assignments.coach_id = app_user_id()
        ))
      )
    )
  );

-- 2.4 interviews_coach_update
DROP POLICY IF EXISTS interviews_coach_update ON public.interviews;
CREATE POLICY interviews_coach_update
  ON public.interviews
  AS PERMISSIVE FOR UPDATE TO public
  USING (
    (app_user_role() = 'admin'::text)
    OR (
      (app_user_role() = 'coach'::text)
      AND (
        (created_by = (SELECT auth.uid()))
        OR (athlete_id IN (
          SELECT coach_swimmer_assignments.swimmer_id
          FROM coach_swimmer_assignments
          WHERE coach_swimmer_assignments.coach_id = app_user_id()
        ))
      )
    )
  );

-- 2.5 objectives_select
DROP POLICY IF EXISTS objectives_select ON public.objectives;
CREATE POLICY objectives_select
  ON public.objectives
  AS PERMISSIVE FOR SELECT TO public
  USING (
    (athlete_id = (SELECT auth.uid()))
    OR (app_user_role() = ANY (ARRAY['admin'::text, 'coach'::text]))
  );

-- 2.6 objectives_write
DROP POLICY IF EXISTS objectives_write ON public.objectives;
CREATE POLICY objectives_write
  ON public.objectives
  AS PERMISSIVE FOR ALL TO public
  USING (
    (app_user_role() = ANY (ARRAY['admin'::text, 'coach'::text]))
    OR (athlete_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    (app_user_role() = ANY (ARRAY['admin'::text, 'coach'::text]))
    OR (athlete_id = (SELECT auth.uid()))
  );

-- 2.7 swim_exercise_logs "Users manage own exercise logs"
DROP POLICY IF EXISTS "Users manage own exercise logs" ON public.swim_exercise_logs;
CREATE POLICY "Users manage own exercise logs"
  ON public.swim_exercise_logs
  AS PERMISSIVE FOR ALL TO public
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- 2.8 timesheet_group_labels DELETE
DROP POLICY IF EXISTS "Coaches can delete group labels" ON public.timesheet_group_labels;
CREATE POLICY "Coaches can delete group labels"
  ON public.timesheet_group_labels
  AS PERMISSIVE FOR DELETE TO public
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = (
        SELECT users.id FROM users
        WHERE users.email = ((SELECT users_1.email FROM auth.users users_1 WHERE users_1.id = (SELECT auth.uid())))::text
      )
      AND u.role = ANY (ARRAY['coach'::text, 'admin'::text])
    )
  );

-- 2.9 timesheet_group_labels INSERT
DROP POLICY IF EXISTS "Coaches can insert group labels" ON public.timesheet_group_labels;
CREATE POLICY "Coaches can insert group labels"
  ON public.timesheet_group_labels
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = (
        SELECT users.id FROM users
        WHERE users.email = ((SELECT users_1.email FROM auth.users users_1 WHERE users_1.id = (SELECT auth.uid())))::text
      )
      AND u.role = ANY (ARRAY['coach'::text, 'admin'::text])
    )
  );

-- 2.10 timesheet_group_labels SELECT
DROP POLICY IF EXISTS "Coaches can read group labels" ON public.timesheet_group_labels;
CREATE POLICY "Coaches can read group labels"
  ON public.timesheet_group_labels
  AS PERMISSIVE FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = (
        SELECT users.id FROM users
        WHERE users.email = ((SELECT users_1.email FROM auth.users users_1 WHERE users_1.id = (SELECT auth.uid())))::text
      )
      AND u.role = ANY (ARRAY['coach'::text, 'admin'::text])
    )
  );

-- 2.11 timesheet_shift_groups DELETE
DROP POLICY IF EXISTS "Coaches can delete shift groups" ON public.timesheet_shift_groups;
CREATE POLICY "Coaches can delete shift groups"
  ON public.timesheet_shift_groups
  AS PERMISSIVE FOR DELETE TO public
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = (
        SELECT users.id FROM users
        WHERE users.email = ((SELECT users_1.email FROM auth.users users_1 WHERE users_1.id = (SELECT auth.uid())))::text
      )
      AND u.role = ANY (ARRAY['coach'::text, 'admin'::text])
    )
  );

-- 2.12 timesheet_shift_groups INSERT
DROP POLICY IF EXISTS "Coaches can insert shift groups" ON public.timesheet_shift_groups;
CREATE POLICY "Coaches can insert shift groups"
  ON public.timesheet_shift_groups
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = (
        SELECT users.id FROM users
        WHERE users.email = ((SELECT users_1.email FROM auth.users users_1 WHERE users_1.id = (SELECT auth.uid())))::text
      )
      AND u.role = ANY (ARRAY['coach'::text, 'admin'::text])
    )
  );

-- 2.13 timesheet_shift_groups SELECT
DROP POLICY IF EXISTS "Coaches can read shift groups" ON public.timesheet_shift_groups;
CREATE POLICY "Coaches can read shift groups"
  ON public.timesheet_shift_groups
  AS PERMISSIVE FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = (
        SELECT users.id FROM users
        WHERE users.email = ((SELECT users_1.email FROM auth.users users_1 WHERE users_1.id = (SELECT auth.uid())))::text
      )
      AND u.role = ANY (ARRAY['coach'::text, 'admin'::text])
    )
  );
