-- Adds per-slot granularity to planned_absences.
-- Previously an absence was always whole-day; now it can be scoped to
-- morning/evening or a specific training_slot. NULL scheduled_slot = whole day.

ALTER TABLE planned_absences
  ADD COLUMN IF NOT EXISTS scheduled_slot text CHECK (scheduled_slot IN ('morning', 'evening')),
  ADD COLUMN IF NOT EXISTS training_slot_id uuid REFERENCES training_slots(id) ON DELETE SET NULL;

-- Drop old whole-day unique constraint (confirmed name via pg_constraint).
ALTER TABLE planned_absences
  DROP CONSTRAINT IF EXISTS planned_absences_user_id_date_key;

-- New partial unique: coalesce NULL to 'all' so whole-day absence doesn't
-- conflict with morning+evening rows on the same date.
CREATE UNIQUE INDEX IF NOT EXISTS planned_absences_user_date_slot_unique
  ON planned_absences(user_id, date, COALESCE(scheduled_slot, 'all'));

CREATE INDEX IF NOT EXISTS idx_pa_user_date_slot
  ON planned_absences(user_id, date, scheduled_slot);

COMMENT ON COLUMN planned_absences.scheduled_slot IS
  'NULL = whole-day absence, morning/evening = scoped to bucket';
COMMENT ON COLUMN planned_absences.training_slot_id IS
  'Optional precise reference when two slots coexist in the same bucket';
