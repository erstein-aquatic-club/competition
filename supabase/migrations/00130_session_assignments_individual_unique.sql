-- Prevent duplicate individual swim assignments on the same (slot, date, user).
-- Group duplicates are already prevented by idx_sa_unique_slot_group_v2 (§80+).

CREATE UNIQUE INDEX IF NOT EXISTS idx_sa_unique_slot_user_v1
  ON session_assignments(training_slot_id, scheduled_date, target_user_id)
  WHERE target_user_id IS NOT NULL AND assignment_type = 'swim';
