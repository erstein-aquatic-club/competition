-- Challenges d'équipe (gamification)
CREATE TABLE IF NOT EXISTS challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id INTEGER NOT NULL REFERENCES users(id),
  group_id INTEGER REFERENCES groups(id),
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('attendance', 'wellness', 'custom')),
  target NUMERIC NOT NULL,
  current_value NUMERIC DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;

-- Coach: full CRUD
CREATE POLICY challenges_coach ON challenges
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = app_user_id() AND u.role IN ('coach', 'admin'))
  );

-- Swimmer: read challenges for their group or club-wide (group_id IS NULL)
CREATE POLICY challenges_swimmer_read ON challenges
  FOR SELECT USING (
    group_id IS NULL OR
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.user_id = app_user_id() AND gm.group_id = challenges.group_id
    )
  );
