-- Add support for one-off (exceptional) training slots.
-- When scheduled_date is set, the slot only appears on that specific date.
-- When null, the slot is recurring via day_of_week (existing behavior).

ALTER TABLE training_slots
  ADD COLUMN scheduled_date DATE;

-- Drop the old unique constraint that doesn't account for scheduled_date
ALTER TABLE training_slots
  DROP CONSTRAINT IF EXISTS training_slots_day_of_week_start_time_end_time_location_key;

-- Recurring slots: unique per (day_of_week, start_time, end_time, location) where scheduled_date IS NULL
CREATE UNIQUE INDEX uq_training_slots_recurring
  ON training_slots (day_of_week, start_time, end_time, location)
  WHERE scheduled_date IS NULL AND is_active = true;

-- One-off slots: unique per (scheduled_date, start_time, end_time, location)
CREATE UNIQUE INDEX uq_training_slots_oneoff
  ON training_slots (scheduled_date, start_time, end_time, location)
  WHERE scheduled_date IS NOT NULL AND is_active = true;

-- Index for fetching one-off slots by date range
CREATE INDEX idx_training_slots_scheduled_date
  ON training_slots (scheduled_date)
  WHERE scheduled_date IS NOT NULL AND is_active = true;
