-- =============================================================================
-- supabase/tests/schema.sql
--
-- Minimal hand-crafted schema for RLS integration tests (see docs/rls-testing.md).
--
-- Why hand-crafted vs. dump from prod?
-- -------------------------------------
-- The full prod schema has ~65 tables with significant drift from the migration
-- files (some columns added via MCP, never backfilled). Replaying the full
-- migration history locally is brittle. Instead we hand-craft only the tables
-- needed for each RLS test scenario, and grow incrementally as new policies
-- need coverage.
--
-- This file is reset and re-applied before EACH test suite — see _helpers.ts.
--
-- IMPORTANT: keep this in sync with prod when policies change. The whole point
-- is to mirror the exact policy expressions from prod so a regression here
-- means a regression there.
-- =============================================================================

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

-- =============================================================================
-- AUTH HELPERS (mirror prod definitions, same source as `00027_get_auth_uid_rpc.sql`)
-- =============================================================================
-- These read JWT claims set via SET LOCAL request.jwt.claims = '{...}' in tests.
-- Source of truth: prod project fscnobivsgornxdwqwlk.

CREATE OR REPLACE FUNCTION public.app_user_id()
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'app_user_id')::integer,
    NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.app_user_role()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'app_user_role',
    'athlete'
  );
$$;

-- =============================================================================
-- TABLES
-- =============================================================================

CREATE TABLE public.users (
  id SERIAL PRIMARY KEY,
  display_name TEXT NOT NULL,
  display_name_lower TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'athlete' CHECK (role IN ('athlete','coach','admin')),
  email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.dim_sessions (
  id SERIAL PRIMARY KEY,
  athlete_id INTEGER REFERENCES public.users(id) ON DELETE CASCADE,
  athlete_name TEXT NOT NULL,
  session_date DATE NOT NULL,
  time_slot TEXT NOT NULL,
  duration INTEGER NOT NULL,
  rpe INTEGER NOT NULL,
  distance INTEGER,
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.dim_sessions ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS POLICIES (mirror prod — keep in sync with §113 fix migration 00108)
-- =============================================================================

CREATE POLICY dim_sessions_select ON public.dim_sessions
  FOR SELECT
  USING (athlete_id = app_user_id() OR app_user_role() IN ('admin','coach'));

CREATE POLICY dim_sessions_insert ON public.dim_sessions
  FOR INSERT
  WITH CHECK (athlete_id = app_user_id() OR app_user_role() IN ('admin','coach'));

CREATE POLICY dim_sessions_update ON public.dim_sessions
  FOR UPDATE
  USING (athlete_id = app_user_id() OR app_user_role() IN ('admin','coach'));

CREATE POLICY dim_sessions_delete ON public.dim_sessions
  FOR DELETE
  USING (athlete_id = app_user_id() OR app_user_role() IN ('admin','coach'));

-- =============================================================================
-- coach_swimmer_assignments (§98) — parent table for interviews subquery
-- Keep in sync with migration 00072_coach_swimmer_assignments.sql
-- =============================================================================

CREATE TABLE public.coach_swimmer_assignments (
  id SERIAL PRIMARY KEY,
  coach_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  swimmer_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by INTEGER NOT NULL REFERENCES public.users(id)
);

ALTER TABLE public.coach_swimmer_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY csa_select ON public.coach_swimmer_assignments
  FOR SELECT USING (app_user_role() = ANY (ARRAY['coach','admin']));

CREATE POLICY csa_insert ON public.coach_swimmer_assignments
  FOR INSERT WITH CHECK (
    (app_user_role() = 'coach' AND coach_id = app_user_id())
    OR app_user_role() = 'admin'
  );

CREATE POLICY csa_update ON public.coach_swimmer_assignments
  FOR UPDATE USING (app_user_role() = 'admin');

CREATE POLICY csa_delete ON public.coach_swimmer_assignments
  FOR DELETE USING (
    (app_user_role() = 'coach' AND coach_id = app_user_id())
    OR app_user_role() = 'admin'
  );

-- =============================================================================
-- interviews (§74-§75) — entretiens conversationnels multi-phases
-- 6 policies stateful avec subquery cross-table sur coach_swimmer_assignments.
-- Keep in sync with migrations 00035_interviews.sql, 00036_interview_transition_rpcs.sql,
-- 00037_interview_conversational_fields.sql.
-- =============================================================================

CREATE TABLE public.interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft_athlete',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  athlete_successes TEXT,
  athlete_difficulties TEXT,
  athlete_goals TEXT,
  athlete_commitments TEXT,
  coach_review TEXT,
  coach_objectives TEXT,
  coach_actions TEXT,
  submitted_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  created_by UUID,  -- auth.users.id (not public.users.id) — matches auth.uid()
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;

-- Athlete reads only own, and only in a published state
CREATE POLICY interviews_athlete_select ON public.interviews
  FOR SELECT USING (
    app_user_role() = 'athlete'
    AND athlete_id = app_user_id()
    AND status = ANY (ARRAY['draft_athlete','draft_coach','sent','signed'])
  );

-- Athlete updates own, USING (read-filter) is tighter than WITH CHECK (write-filter)
-- The asymmetry is intentional: athlete can open in 'draft_athlete' or 'sent',
-- and move to 'draft_athlete','draft_coach','sent', or 'signed'.
CREATE POLICY interviews_athlete_update ON public.interviews
  FOR UPDATE
  USING (
    app_user_role() = 'athlete'
    AND athlete_id = app_user_id()
    AND status = ANY (ARRAY['draft_athlete','sent'])
  )
  WITH CHECK (
    app_user_role() = 'athlete'
    AND athlete_id = app_user_id()
    AND status = ANY (ARRAY['draft_athlete','draft_coach','sent','signed'])
  );

-- Coach reads: admin OR (coach AND (creator OR assigned via coach_swimmer_assignments))
CREATE POLICY interviews_coach_select ON public.interviews
  FOR SELECT USING (
    app_user_role() = 'admin'
    OR (
      app_user_role() = 'coach'
      AND (
        created_by = (SELECT auth.uid())
        OR athlete_id IN (
          SELECT swimmer_id FROM public.coach_swimmer_assignments
          WHERE coach_id = app_user_id()
        )
      )
    )
  );

CREATE POLICY interviews_coach_update ON public.interviews
  FOR UPDATE USING (
    app_user_role() = 'admin'
    OR (
      app_user_role() = 'coach'
      AND (
        created_by = (SELECT auth.uid())
        OR athlete_id IN (
          SELECT swimmer_id FROM public.coach_swimmer_assignments
          WHERE coach_id = app_user_id()
        )
      )
    )
  );

CREATE POLICY interviews_coach_insert ON public.interviews
  FOR INSERT WITH CHECK (
    app_user_role() = ANY (ARRAY['admin','coach'])
  );

CREATE POLICY interviews_coach_delete ON public.interviews
  FOR DELETE USING (
    app_user_role() = 'admin'
    OR (
      app_user_role() = 'coach'
      AND created_by = (SELECT auth.uid())
    )
  );

-- =============================================================================
-- groups + group_members — dependency for session_assignments + notification_targets
-- =============================================================================

CREATE TABLE public.groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.group_members (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_in_group TEXT,
  joined_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY group_members_select ON public.group_members
  FOR SELECT USING (true);

CREATE POLICY group_members_write ON public.group_members
  FOR ALL USING (app_user_role() = ANY (ARRAY['admin','coach']));

-- =============================================================================
-- session_assignments (§85, §101) — hot path: every assigned swim/strength session
-- 2 policies, SELECT is the complex one (326 chars, 4 branches + visible_from gate)
-- =============================================================================

CREATE TABLE public.session_assignments (
  id SERIAL PRIMARY KEY,
  assignment_type TEXT NOT NULL,
  swim_catalog_id INTEGER,
  strength_session_id INTEGER,
  target_user_id INTEGER REFERENCES public.users(id),
  target_group_id INTEGER REFERENCES public.groups(id),
  assigned_by INTEGER REFERENCES public.users(id),
  scheduled_date DATE,
  status TEXT NOT NULL DEFAULT 'assigned',
  scheduled_slot TEXT,
  visible_from DATE,
  training_slot_id UUID,
  target_subgroup_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.session_assignments ENABLE ROW LEVEL SECURITY;

-- SELECT: coach/admin bypass | creator sees own | athlete direct + visible_from gate | athlete group + visible_from gate
CREATE POLICY assignments_select ON public.session_assignments
  FOR SELECT USING (
    (app_user_role() = ANY (ARRAY['admin','coach']))
    OR (assigned_by = app_user_id())
    OR (
      ((visible_from IS NULL) OR (visible_from <= CURRENT_DATE))
      AND (
        (target_user_id = app_user_id())
        OR (target_group_id IN (
          SELECT group_id FROM group_members WHERE user_id = app_user_id()
        ))
      )
    )
  );

-- WRITE (INSERT/UPDATE/DELETE): coach/admin only
CREATE POLICY assignments_write ON public.session_assignments
  FOR ALL USING (app_user_role() = ANY (ARRAY['admin','coach']));

-- =============================================================================
-- notifications + notification_targets (§16 fix, §79 push)
-- notification_targets has an asymmetry: SELECT includes group branch, UPDATE does NOT.
-- =============================================================================

CREATE TABLE public.notifications (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT NOT NULL,
  created_by INTEGER REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.notification_targets (
  id SERIAL PRIMARY KEY,
  notification_id INTEGER NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  target_user_id INTEGER REFERENCES public.users(id),
  target_group_id INTEGER REFERENCES public.groups(id),
  read_at TIMESTAMPTZ
);

ALTER TABLE public.notification_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_targets_select ON public.notification_targets
  FOR SELECT USING (
    (target_user_id = app_user_id())
    OR (target_group_id IN (
      SELECT group_id FROM group_members WHERE user_id = app_user_id()
    ))
    OR (app_user_role() = ANY (ARRAY['admin','coach']))
  );

-- NOTE: UPDATE intentionally does NOT include the group_members branch.
-- An athlete can mark-read their direct notifications, but NOT group notifications.
CREATE POLICY notification_targets_update ON public.notification_targets
  FOR UPDATE USING (
    (target_user_id = app_user_id())
    OR (app_user_role() = ANY (ARRAY['admin','coach']))
  );

CREATE POLICY notification_targets_insert ON public.notification_targets
  FOR INSERT WITH CHECK (
    app_user_role() = ANY (ARRAY['admin','coach'])
  );

-- =============================================================================
-- strength_session_runs + strength_set_logs — parent-child with EXISTS subquery
-- Asymmetry: runs_delete is admin-only (coach excluded), insert/update includes coach.
-- set_logs uses EXISTS on runs for all ops (no direct athlete_id column).
-- =============================================================================

CREATE TABLE public.strength_session_runs (
  id SERIAL PRIMARY KEY,
  athlete_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress',
  session_id INTEGER,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  fatigue INTEGER,
  comments TEXT
);

ALTER TABLE public.strength_session_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY runs_select ON public.strength_session_runs
  FOR SELECT USING (athlete_id = app_user_id() OR app_user_role() = ANY (ARRAY['admin','coach']));

CREATE POLICY runs_insert ON public.strength_session_runs
  FOR INSERT WITH CHECK (athlete_id = app_user_id() OR app_user_role() = ANY (ARRAY['admin','coach']));

CREATE POLICY runs_update ON public.strength_session_runs
  FOR UPDATE USING (athlete_id = app_user_id() OR app_user_role() = ANY (ARRAY['admin','coach']));

-- NOTE: coach EXCLUDED from delete — only athlete + admin
CREATE POLICY runs_delete ON public.strength_session_runs
  FOR DELETE USING (athlete_id = app_user_id() OR app_user_role() = 'admin');

CREATE TABLE public.strength_set_logs (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES public.strength_session_runs(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL,
  set_index INTEGER,
  reps INTEGER,
  weight DOUBLE PRECISION,
  rpe INTEGER,
  notes TEXT,
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.strength_set_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY set_logs_select ON public.strength_set_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM strength_session_runs r
            WHERE r.id = strength_set_logs.run_id
              AND (r.athlete_id = app_user_id() OR app_user_role() = ANY (ARRAY['admin','coach'])))
  );

CREATE POLICY set_logs_write ON public.strength_set_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM strength_session_runs r
            WHERE r.id = strength_set_logs.run_id
              AND (r.athlete_id = app_user_id() OR app_user_role() = ANY (ARRAY['admin','coach'])))
  );

-- =============================================================================
-- competition_checklists + competition_checklist_checks (§87)
-- Parent-child: checks → checklists → competitions
-- insert/update on checks: athlete-only (coach excluded from mutation)
-- =============================================================================

CREATE TABLE public.competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.competition_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  athlete_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  checklist_template_id UUID NOT NULL
);

ALTER TABLE public.competition_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY competition_checklists_select ON public.competition_checklists
  FOR SELECT USING (athlete_id = app_user_id() OR app_user_role() = ANY (ARRAY['coach','admin']));

CREATE POLICY competition_checklists_own_insert ON public.competition_checklists
  FOR INSERT WITH CHECK (athlete_id = app_user_id());

CREATE POLICY competition_checklists_own_delete ON public.competition_checklists
  FOR DELETE USING (athlete_id = app_user_id());

CREATE TABLE public.competition_checklist_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_checklist_id UUID NOT NULL REFERENCES public.competition_checklists(id) ON DELETE CASCADE,
  checklist_item_id UUID NOT NULL,
  checked BOOLEAN NOT NULL DEFAULT FALSE,
  checked_at TIMESTAMPTZ
);

ALTER TABLE public.competition_checklist_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY competition_checklist_checks_select ON public.competition_checklist_checks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM competition_checklists cc
            WHERE cc.id = competition_checklist_checks.competition_checklist_id
              AND (cc.athlete_id = app_user_id() OR app_user_role() = ANY (ARRAY['coach','admin'])))
  );

CREATE POLICY competition_checklist_checks_own_insert ON public.competition_checklist_checks
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM competition_checklists cc
            WHERE cc.id = competition_checklist_checks.competition_checklist_id
              AND cc.athlete_id = app_user_id())
  );

CREATE POLICY competition_checklist_checks_own_update ON public.competition_checklist_checks
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM competition_checklists cc
            WHERE cc.id = competition_checklist_checks.competition_checklist_id
              AND cc.athlete_id = app_user_id())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM competition_checklists cc
            WHERE cc.id = competition_checklist_checks.competition_checklist_id
              AND cc.athlete_id = app_user_id())
  );
