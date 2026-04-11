-- Allow coaches/admins to insert swim exercise logs for any athlete
-- Needed for the Chrono feature where coaches record split times

CREATE POLICY "Coaches insert exercise logs for athletes"
  ON swim_exercise_logs FOR INSERT
  WITH CHECK (app_user_role() IN ('coach', 'admin'));

-- Also allow coaches to update/delete logs they inserted
CREATE POLICY "Coaches manage exercise logs"
  ON swim_exercise_logs FOR UPDATE
  USING (app_user_role() IN ('coach', 'admin'));

CREATE POLICY "Coaches delete exercise logs"
  ON swim_exercise_logs FOR DELETE
  USING (app_user_role() IN ('coach', 'admin'));
