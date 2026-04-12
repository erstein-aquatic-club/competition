-- Add session_type to training slots (swim | strength)
-- Backfill: 'strength' when location evokes "salle" (muscu), 'swim' otherwise.

-- ── training_slots ──────────────────────────────────────────
ALTER TABLE training_slots
  ADD COLUMN IF NOT EXISTS session_type TEXT;

UPDATE training_slots
SET session_type = CASE
  WHEN location ILIKE '%salle%' THEN 'strength'
  ELSE 'swim'
END
WHERE session_type IS NULL;

ALTER TABLE training_slots
  ALTER COLUMN session_type SET NOT NULL,
  ALTER COLUMN session_type SET DEFAULT 'swim';

ALTER TABLE training_slots
  DROP CONSTRAINT IF EXISTS training_slots_session_type_check;
ALTER TABLE training_slots
  ADD CONSTRAINT training_slots_session_type_check
  CHECK (session_type IN ('swim', 'strength'));

CREATE INDEX IF NOT EXISTS idx_training_slots_session_type
  ON training_slots (session_type) WHERE is_active = true;

-- ── swimmer_training_slots (personal overrides) ─────────────
ALTER TABLE swimmer_training_slots
  ADD COLUMN IF NOT EXISTS session_type TEXT;

UPDATE swimmer_training_slots
SET session_type = CASE
  WHEN location ILIKE '%salle%' THEN 'strength'
  ELSE 'swim'
END
WHERE session_type IS NULL;

ALTER TABLE swimmer_training_slots
  ALTER COLUMN session_type SET NOT NULL,
  ALTER COLUMN session_type SET DEFAULT 'swim';

ALTER TABLE swimmer_training_slots
  DROP CONSTRAINT IF EXISTS swimmer_training_slots_session_type_check;
ALTER TABLE swimmer_training_slots
  ADD CONSTRAINT swimmer_training_slots_session_type_check
  CHECK (session_type IN ('swim', 'strength'));
