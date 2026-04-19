-- =============================================================================
-- Migration 00131: Swim planning overrides (slot + week) + group week meta
-- Part of the individual swim planning chantier — replaces training_cycles/
-- training_weeks semantics on top of swim_planning_slots.
-- =============================================================================

-- 1. Group-level week meta (promoted from localStorage in SwimPlanningDemo)
CREATE TABLE IF NOT EXISTS swim_planning_week_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id integer NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_type text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, week_start)
);

CREATE INDEX idx_swim_planning_week_meta_group_week
  ON swim_planning_week_meta(group_id, week_start);

-- 2. Per-athlete filière/session override on a given slot
CREATE TABLE IF NOT EXISTS swim_planning_slot_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 5),
  time_slot text NOT NULL CHECK (time_slot IN ('morning', 'evening')),
  filiere text NOT NULL,
  session_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(athlete_id, week_start, day_of_week, time_slot)
);

CREATE INDEX idx_swim_planning_slot_overrides_athlete_week
  ON swim_planning_slot_overrides(athlete_id, week_start);

-- 3. Per-athlete week_type/notes override
CREATE TABLE IF NOT EXISTS swim_planning_week_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_type text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(athlete_id, week_start)
);

CREATE INDEX idx_swim_planning_week_overrides_athlete_week
  ON swim_planning_week_overrides(athlete_id, week_start);

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE swim_planning_week_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE swim_planning_slot_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE swim_planning_week_overrides ENABLE ROW LEVEL SECURITY;

-- Mirror swim_planning_slots: everyone authenticated reads, only coach/admin writes.
-- app_user_role() wrapped in (SELECT) to avoid auth_rls_initplan per §124.

CREATE POLICY swim_planning_week_meta_select ON swim_planning_week_meta
  FOR SELECT TO authenticated USING (true);
CREATE POLICY swim_planning_week_meta_insert ON swim_planning_week_meta
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY swim_planning_week_meta_update ON swim_planning_week_meta
  FOR UPDATE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY swim_planning_week_meta_delete ON swim_planning_week_meta
  FOR DELETE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));

CREATE POLICY swim_planning_slot_overrides_select ON swim_planning_slot_overrides
  FOR SELECT TO authenticated USING (true);
CREATE POLICY swim_planning_slot_overrides_insert ON swim_planning_slot_overrides
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY swim_planning_slot_overrides_update ON swim_planning_slot_overrides
  FOR UPDATE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY swim_planning_slot_overrides_delete ON swim_planning_slot_overrides
  FOR DELETE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));

CREATE POLICY swim_planning_week_overrides_select ON swim_planning_week_overrides
  FOR SELECT TO authenticated USING (true);
CREATE POLICY swim_planning_week_overrides_insert ON swim_planning_week_overrides
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY swim_planning_week_overrides_update ON swim_planning_week_overrides
  FOR UPDATE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));
CREATE POLICY swim_planning_week_overrides_delete ON swim_planning_week_overrides
  FOR DELETE TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'));

-- =============================================================================
-- BACKFILL from training_cycles/training_weeks (athlete-scoped cycles only)
-- =============================================================================
-- For each athlete with training weeks carrying week_type or notes, take the
-- most recently-created cycle's value as authoritative (collision rule).

INSERT INTO swim_planning_week_overrides (athlete_id, week_start, week_type, notes)
SELECT DISTINCT ON (tc.athlete_id, tw.week_start)
  tc.athlete_id, tw.week_start, tw.week_type, tw.notes
FROM training_weeks tw
JOIN training_cycles tc ON tc.id = tw.cycle_id
WHERE tc.athlete_id IS NOT NULL
  AND (tw.week_type IS NOT NULL OR tw.notes IS NOT NULL)
ORDER BY tc.athlete_id, tw.week_start, tc.created_at DESC
ON CONFLICT (athlete_id, week_start) DO NOTHING;

-- Group-scoped cycles (tc.group_id IS NOT NULL) are NOT backfilled: the
-- semantic of "cycle between 2 competitions" does not map cleanly to a
-- timeline-wide "group week_type". Coach can re-enter meaningful values via
-- the new UI.
