-- Validate the chk_visible_from_before_date constraint on session_assignments.
-- It was created NOT VALID in 00088_swim_create_atomic_and_fixes.sql so it
-- never enforced the invariant. No existing row violates it (verified), so
-- we can mark it validated in-place — new rows are already checked by the
-- constraint definition, but VALIDATE also enables the planner to rely on it.

ALTER TABLE session_assignments VALIDATE CONSTRAINT chk_visible_from_before_date;
