-- Audit v2 — findings H2, M2, M3, M4
-- H2 : competitions.end_date >= date (0 violations vérifiées)
-- M2 : *.created_by UUID REFERENCES auth.users sans ON DELETE → SET NULL
-- M3 : training_slot_assignments.group_id sans ON DELETE → CASCADE
-- M4 : training_slot_overrides.created_by sans ON DELETE → SET NULL

-- H2: competition date range
ALTER TABLE competitions
  ADD CONSTRAINT chk_competitions_end_date_after_date
  CHECK (end_date IS NULL OR end_date >= date);

-- M2: created_by FKs → ON DELETE SET NULL
ALTER TABLE competitions
  DROP CONSTRAINT IF EXISTS competitions_created_by_fkey,
  ADD CONSTRAINT competitions_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE interviews
  DROP CONSTRAINT IF EXISTS interviews_created_by_fkey,
  ADD CONSTRAINT interviews_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE training_cycles
  DROP CONSTRAINT IF EXISTS training_cycles_created_by_fkey,
  ADD CONSTRAINT training_cycles_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- M3: training_slot_assignments.group_id → CASCADE
ALTER TABLE training_slot_assignments
  DROP CONSTRAINT IF EXISTS training_slot_assignments_group_id_fkey,
  ADD CONSTRAINT training_slot_assignments_group_id_fkey
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

-- M4: training_slot_overrides.created_by → SET NULL
ALTER TABLE training_slot_overrides
  DROP CONSTRAINT IF EXISTS training_slot_overrides_created_by_fkey,
  ADD CONSTRAINT training_slot_overrides_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
