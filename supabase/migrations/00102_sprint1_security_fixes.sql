-- Sprint 1 security fixes — 2026-04-12
-- Plan: docs/plans/2026-04-12-sprint1-security-fixes.md
--
-- Covers 4 critical RLS/storage fixes:
--   1/ admin_audit_log INSERT locked to admin role
--   2/ training_slots (+ assignments + overrides) mutation ownership check
--   3/ avatars storage bucket ownership (per app user id)
--   4/ exercise-gifs storage bucket restricted to coach/admin
--
-- All statements are idempotent (DROP POLICY IF EXISTS + CREATE POLICY).

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- Fix 1/4: admin_audit_log INSERT must be admin-only
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "System can insert audit log" ON public.admin_audit_log;
DROP POLICY IF EXISTS "Admin can insert audit log" ON public.admin_audit_log;

CREATE POLICY "Admin can insert audit log" ON public.admin_audit_log
  FOR INSERT WITH CHECK (app_user_role() = 'admin');

-- ─────────────────────────────────────────────────────────────
-- Fix 2/4: training_slots ownership check (no cross-coach mutations)
-- ─────────────────────────────────────────────────────────────

-- Backfill created_by for orphan slots so existing rows remain mutable
-- by admins after the new policies take effect.
UPDATE training_slots
   SET created_by = (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1)
 WHERE created_by IS NULL;

DROP POLICY IF EXISTS "training_slots_coach_update" ON training_slots;
CREATE POLICY "training_slots_coach_update" ON training_slots
  FOR UPDATE TO authenticated
  USING (
    app_user_role() = 'admin'
    OR (app_user_role() = 'coach' AND created_by = app_user_id())
  )
  WITH CHECK (
    app_user_role() = 'admin'
    OR (app_user_role() = 'coach' AND created_by = app_user_id())
  );

DROP POLICY IF EXISTS "training_slots_coach_delete" ON training_slots;
CREATE POLICY "training_slots_coach_delete" ON training_slots
  FOR DELETE TO authenticated
  USING (
    app_user_role() = 'admin'
    OR (app_user_role() = 'coach' AND created_by = app_user_id())
  );

-- Assignments: ownership via parent slot
DROP POLICY IF EXISTS "training_slot_assignments_coach_update" ON training_slot_assignments;
CREATE POLICY "training_slot_assignments_coach_update" ON training_slot_assignments
  FOR UPDATE TO authenticated
  USING (
    app_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM training_slots s
      WHERE s.id = training_slot_assignments.slot_id
        AND s.created_by = app_user_id()
    )
  )
  WITH CHECK (
    app_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM training_slots s
      WHERE s.id = training_slot_assignments.slot_id
        AND s.created_by = app_user_id()
    )
  );

DROP POLICY IF EXISTS "training_slot_assignments_coach_delete" ON training_slot_assignments;
CREATE POLICY "training_slot_assignments_coach_delete" ON training_slot_assignments
  FOR DELETE TO authenticated
  USING (
    app_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM training_slots s
      WHERE s.id = training_slot_assignments.slot_id
        AND s.created_by = app_user_id()
    )
  );

-- Overrides: ownership via parent slot
DROP POLICY IF EXISTS "training_slot_overrides_coach_update" ON training_slot_overrides;
CREATE POLICY "training_slot_overrides_coach_update" ON training_slot_overrides
  FOR UPDATE TO authenticated
  USING (
    app_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM training_slots s
      WHERE s.id = training_slot_overrides.slot_id
        AND s.created_by = app_user_id()
    )
  )
  WITH CHECK (
    app_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM training_slots s
      WHERE s.id = training_slot_overrides.slot_id
        AND s.created_by = app_user_id()
    )
  );

DROP POLICY IF EXISTS "training_slot_overrides_coach_delete" ON training_slot_overrides;
CREATE POLICY "training_slot_overrides_coach_delete" ON training_slot_overrides
  FOR DELETE TO authenticated
  USING (
    app_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM training_slots s
      WHERE s.id = training_slot_overrides.slot_id
        AND s.created_by = app_user_id()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- Fix 3/4: avatars storage ownership
-- ─────────────────────────────────────────────────────────────
--
-- Actual path convention used by src/lib/api/users.ts:uploadAvatar:
--   `<app_user_id>.<ext>`  (flat file, NOT `<uuid>/avatar.ext`)
-- So ownership is checked via split_part(name, '.', 1) = app_user_id()::text
-- which compares the base filename to the application integer user id.

DROP POLICY IF EXISTS "avatars_auth_insert" ON storage.objects;
CREATE POLICY "avatars_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND split_part(name, '.', 1) = app_user_id()::text
  );

DROP POLICY IF EXISTS "avatars_auth_update" ON storage.objects;
CREATE POLICY "avatars_auth_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND split_part(name, '.', 1) = app_user_id()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND split_part(name, '.', 1) = app_user_id()::text
  );

DROP POLICY IF EXISTS "avatars_auth_delete" ON storage.objects;
CREATE POLICY "avatars_auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND split_part(name, '.', 1) = app_user_id()::text
  );

-- ─────────────────────────────────────────────────────────────
-- Fix 4/4: exercise-gifs storage restricted to coach/admin
-- ─────────────────────────────────────────────────────────────
--
-- Path convention used by src/pages/coach/StrengthCatalog.tsx:
--   `exercises/<timestamp>-<random>.<ext>`  (no per-user folder).
-- GIFs are uploaded by coaches only, so we gate mutations by role.

DROP POLICY IF EXISTS "exercise_gifs_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "exercise_gifs_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "exercise_gifs_auth_delete" ON storage.objects;
DROP POLICY IF EXISTS "exercise_gifs_coach_insert" ON storage.objects;
DROP POLICY IF EXISTS "exercise_gifs_coach_update" ON storage.objects;
DROP POLICY IF EXISTS "exercise_gifs_coach_delete" ON storage.objects;

CREATE POLICY "exercise_gifs_coach_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'exercise-gifs'
    AND app_user_role() IN ('coach', 'admin')
  );

CREATE POLICY "exercise_gifs_coach_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'exercise-gifs'
    AND app_user_role() IN ('coach', 'admin')
  )
  WITH CHECK (
    bucket_id = 'exercise-gifs'
    AND app_user_role() IN ('coach', 'admin')
  );

CREATE POLICY "exercise_gifs_coach_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'exercise-gifs'
    AND app_user_role() IN ('coach', 'admin')
  );

COMMIT;
