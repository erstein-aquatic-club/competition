-- Pain reports: body zone pain tracking for swimmers
CREATE TABLE IF NOT EXISTS pain_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  body_zone TEXT NOT NULL,
  intensity SMALLINT NOT NULL CHECK (intensity BETWEEN 1 AND 3),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pain_user_date ON pain_reports(user_id, date DESC);

ALTER TABLE pain_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY pain_own ON pain_reports
  FOR ALL USING (user_id = app_user_id())
  WITH CHECK (user_id = app_user_id());

CREATE POLICY pain_coach_read ON pain_reports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = app_user_id() AND u.role IN ('coach', 'admin'))
  );
