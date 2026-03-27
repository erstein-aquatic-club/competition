-- Add hierarchy (parent_id) and athlete ownership (athlete_id) to strength_folders
ALTER TABLE strength_folders
  ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES strength_folders(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS athlete_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_strength_folders_athlete_id ON strength_folders(athlete_id);
CREATE INDEX IF NOT EXISTS idx_strength_folders_parent_id ON strength_folders(parent_id);
