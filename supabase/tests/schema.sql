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
