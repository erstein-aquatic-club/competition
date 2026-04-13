-- Allow athletes to delete their own swim sessions (ressenti)
-- Root cause: initial policy only granted DELETE to coach/admin, so the
-- swimmer-side "Supprimer le ressenti" button silently no-opped (PostgREST
-- returns 204 with 0 rows affected when RLS filters everything out).
-- Aligned with dim_sessions_select/insert/update which already let an
-- athlete touch their own rows.

DROP POLICY IF EXISTS dim_sessions_delete ON dim_sessions;

CREATE POLICY dim_sessions_delete ON dim_sessions FOR DELETE
    USING (athlete_id = app_user_id() OR app_user_role() IN ('admin', 'coach'));
