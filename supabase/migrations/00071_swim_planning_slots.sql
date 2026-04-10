-- Swim planning slots: filières assigned to day/time_slot per week per group
CREATE TABLE IF NOT EXISTS swim_planning_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id integer NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 5),
  time_slot text NOT NULL CHECK (time_slot IN ('morning', 'evening')),
  filiere text NOT NULL,
  session_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, week_start, day_of_week, time_slot)
);

ALTER TABLE swim_planning_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage swim planning slots"
  ON swim_planning_slots FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role IN ('coach', 'admin')
    )
  );

CREATE POLICY "Athletes can view swim planning slots"
  ON swim_planning_slots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
    )
  );

CREATE INDEX idx_swim_planning_slots_group_week
  ON swim_planning_slots(group_id, week_start);
