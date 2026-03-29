-- Achievement / badge system for gamification
CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  key TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}',
  UNIQUE(user_id, key)
);

ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY achievements_own ON achievements
  FOR ALL USING (user_id = app_user_id())
  WITH CHECK (user_id = app_user_id());

CREATE POLICY achievements_coach_read ON achievements
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = app_user_id() AND u.role IN ('coach', 'admin'))
  );
