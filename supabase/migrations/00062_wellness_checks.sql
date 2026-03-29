-- wellness_checks: daily wellness questionnaire for athletes
CREATE TABLE IF NOT EXISTS wellness_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  sleep_quality SMALLINT NOT NULL CHECK (sleep_quality BETWEEN 1 AND 5),
  sleep_hours NUMERIC(3,1) CHECK (sleep_hours BETWEEN 0 AND 16),
  fatigue SMALLINT NOT NULL CHECK (fatigue BETWEEN 1 AND 5),
  soreness SMALLINT NOT NULL CHECK (soreness BETWEEN 1 AND 5),
  mood SMALLINT NOT NULL CHECK (mood BETWEEN 1 AND 5),
  stress SMALLINT NOT NULL CHECK (stress BETWEEN 1 AND 5),
  readiness_score SMALLINT NOT NULL CHECK (readiness_score BETWEEN 0 AND 100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE INDEX idx_wellness_user_date ON wellness_checks(user_id, date DESC);

ALTER TABLE wellness_checks ENABLE ROW LEVEL SECURITY;

-- Nageur : CRUD sur ses propres données
CREATE POLICY wellness_own ON wellness_checks
  FOR ALL USING (user_id = app_user_id())
  WITH CHECK (user_id = app_user_id());

-- Coach : lecture des nageurs de ses groupes
CREATE POLICY wellness_coach_read ON wellness_checks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = app_user_id() AND u.role IN ('coach', 'admin')
    )
  );
