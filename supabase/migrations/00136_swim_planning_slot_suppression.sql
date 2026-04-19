-- =============================================================================
-- Migration 00136: Swim planning slot suppression per athlete
-- Allows a coach to hide a group slot for a specific athlete by storing an
-- override with filiere = NULL (sentinel = "suppressed").
-- =============================================================================

ALTER TABLE swim_planning_slot_overrides ALTER COLUMN filiere DROP NOT NULL;
