-- 00145_assignments_write_ownership.sql
-- §171 audit P0 #1: prevent cross-coach mutation of session_assignments.
--
-- The historical `assignments_write FOR ALL` (00001) granted any coach the
-- right to UPDATE/DELETE any assignment, including those created by a
-- different coach. This migration splits the write policy into INSERT
-- (any coach/admin), UPDATE/DELETE (admin OR coach owner via assigned_by).
--
-- Mirrors the §102 pattern on training_slots.

BEGIN;

DROP POLICY IF EXISTS assignments_write ON session_assignments;

CREATE POLICY assignments_insert ON session_assignments
  FOR INSERT TO authenticated
  WITH CHECK (app_user_role() IN ('admin', 'coach'));

CREATE POLICY assignments_update ON session_assignments
  FOR UPDATE TO authenticated
  USING (
    app_user_role() = 'admin'
    OR (app_user_role() = 'coach' AND assigned_by = app_user_id())
  )
  WITH CHECK (
    app_user_role() = 'admin'
    OR (app_user_role() = 'coach' AND assigned_by = app_user_id())
  );

CREATE POLICY assignments_delete ON session_assignments
  FOR DELETE TO authenticated
  USING (
    app_user_role() = 'admin'
    OR (app_user_role() = 'coach' AND assigned_by = app_user_id())
  );

COMMIT;
