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

-- RLS
ALTER TABLE swim_planning_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "swim_planning_slots_select" ON swim_planning_slots
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "swim_planning_slots_insert" ON swim_planning_slots
  FOR INSERT TO authenticated
  WITH CHECK (app_user_role() IN ('coach', 'admin'));

CREATE POLICY "swim_planning_slots_update" ON swim_planning_slots
  FOR UPDATE TO authenticated
  USING (app_user_role() IN ('coach', 'admin'));

CREATE POLICY "swim_planning_slots_delete" ON swim_planning_slots
  FOR DELETE TO authenticated
  USING (app_user_role() IN ('coach', 'admin'));

-- Index for query pattern: fetch all slots for a group in a date range
CREATE INDEX idx_swim_planning_slots_group_week
  ON swim_planning_slots(group_id, week_start);
