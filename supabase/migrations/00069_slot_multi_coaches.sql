-- 1. Add lane_count to training_slots (global)
ALTER TABLE training_slots
ADD COLUMN IF NOT EXISTS lane_count SMALLINT;

-- 2. Migrate lane_count from assignments to slots (take MAX per slot)
UPDATE training_slots ts
SET lane_count = sub.max_lanes
FROM (
  SELECT slot_id, MAX(lane_count) AS max_lanes
  FROM training_slot_assignments
  WHERE lane_count IS NOT NULL
  GROUP BY slot_id
) sub
WHERE ts.id = sub.slot_id;

-- 3. Create training_slot_coaches table
CREATE TABLE training_slot_coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL REFERENCES training_slots(id) ON DELETE CASCADE,
  coach_id INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slot_id, coach_id)
);

CREATE INDEX idx_training_slot_coaches_slot ON training_slot_coaches (slot_id);

-- 4. Migrate existing coach_id from assignments to new table
INSERT INTO training_slot_coaches (slot_id, coach_id)
SELECT DISTINCT slot_id, coach_id
FROM training_slot_assignments
ON CONFLICT (slot_id, coach_id) DO NOTHING;

-- 5. Drop coach_id and lane_count from assignments
ALTER TABLE training_slot_assignments
DROP COLUMN IF EXISTS coach_id,
DROP COLUMN IF EXISTS lane_count;

-- 6. RLS for training_slot_coaches (same as training_slot_assignments)
ALTER TABLE training_slot_coaches ENABLE ROW LEVEL SECURITY;

CREATE POLICY slot_coaches_select ON training_slot_coaches
  FOR SELECT USING (true);

CREATE POLICY slot_coaches_write ON training_slot_coaches
  FOR ALL USING (app_user_role() IN ('admin', 'coach'));
