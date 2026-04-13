-- Defense-in-depth bounds on strength_set_logs scale columns.
-- UI already constrains via ScaleSelector5 (difficulty 1-5), but a direct API
-- write could insert aberrant values. 0 existing rows violate the bounds.

ALTER TABLE strength_set_logs
  ADD CONSTRAINT chk_strength_set_logs_difficulty
  CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 5);

ALTER TABLE strength_set_logs
  ADD CONSTRAINT chk_strength_set_logs_rpe
  CHECK (rpe IS NULL OR rpe BETWEEN 1 AND 10);
