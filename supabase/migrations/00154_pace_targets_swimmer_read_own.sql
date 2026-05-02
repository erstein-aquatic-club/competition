-- §188 — Allow swimmers to SELECT their own pace targets.
-- Needed for PaceMatrixInline display on the swimmer's objectives page.
-- The existing policy "coach_pace_targets_all_own" only allows the coach (coach_id = auth.uid()).
-- This SELECT-only policy lets a swimmer read targets where they are the subject.
CREATE POLICY "coach_pace_targets_swimmer_select_own"
  ON coach_pace_targets FOR SELECT
  USING (swimmer_account_id = app_user_id());
