-- 2026-04-19 — Coach QuickView: RLS policies for session_attendance + session_comments
-- Note: swim_planning_slot_overrides and swim_planning_slots already have coach/admin policies
-- that allow INSERT/UPDATE. We do NOT modify them here to avoid breaking the titulaire flow.
-- recorded_by enforcement on those tables is handled at API level.

-- ── session_attendance ───────────────────────────────────────────────────────

-- Any coach/admin can read attendance
DROP POLICY IF EXISTS session_attendance_select ON public.session_attendance;
CREATE POLICY session_attendance_select ON public.session_attendance
  FOR SELECT TO authenticated
  USING (app_user_role() IN ('coach', 'admin', 'comité'));

-- Athlete can read their own attendance
DROP POLICY IF EXISTS session_attendance_athlete_select ON public.session_attendance;
CREATE POLICY session_attendance_athlete_select ON public.session_attendance
  FOR SELECT TO authenticated
  USING (athlete_id = app_user_id());

-- Coach/admin can insert; recorded_by must be auth.uid()
DROP POLICY IF EXISTS session_attendance_insert ON public.session_attendance;
CREATE POLICY session_attendance_insert ON public.session_attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    app_user_role() IN ('coach', 'admin')
    AND recorded_by = auth.uid()
  );

-- Coach/admin can update only rows they recorded
DROP POLICY IF EXISTS session_attendance_update ON public.session_attendance;
CREATE POLICY session_attendance_update ON public.session_attendance
  FOR UPDATE TO authenticated
  USING (
    app_user_role() IN ('coach', 'admin')
    AND recorded_by = auth.uid()
  )
  WITH CHECK (
    app_user_role() IN ('coach', 'admin')
    AND recorded_by = auth.uid()
  );

-- ── session_comments ─────────────────────────────────────────────────────────

-- Coach/admin/comité can read all comments
DROP POLICY IF EXISTS session_comments_select ON public.session_comments;
CREATE POLICY session_comments_select ON public.session_comments
  FOR SELECT TO authenticated
  USING (app_user_role() IN ('coach', 'admin', 'comité'));

-- Athlete can read comments on their own sessions
DROP POLICY IF EXISTS session_comments_athlete_select ON public.session_comments;
CREATE POLICY session_comments_athlete_select ON public.session_comments
  FOR SELECT TO authenticated
  USING (athlete_id = app_user_id());

-- Coach/admin can insert; recorded_by must be auth.uid()
DROP POLICY IF EXISTS session_comments_insert ON public.session_comments;
CREATE POLICY session_comments_insert ON public.session_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    app_user_role() IN ('coach', 'admin')
    AND recorded_by = auth.uid()
  );
