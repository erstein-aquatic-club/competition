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
  fatigue INTEGER, -- §223 : utilisé par get_coach_kpis (coalesce(fatigue, rpe))
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
  is_temporary BOOLEAN NOT NULL DEFAULT FALSE,
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

-- WRITE (split per §174 / migration 00145):
--   INSERT: any coach/admin
--   UPDATE/DELETE: admin OR coach owner via assigned_by = app_user_id()
CREATE POLICY assignments_insert ON public.session_assignments
  FOR INSERT TO authenticated
  WITH CHECK (app_user_role() IN ('admin', 'coach'));

CREATE POLICY assignments_update ON public.session_assignments
  FOR UPDATE TO authenticated
  USING (
    app_user_role() = 'admin'
    OR (app_user_role() = 'coach' AND assigned_by = app_user_id())
  )
  WITH CHECK (
    app_user_role() = 'admin'
    OR (app_user_role() = 'coach' AND assigned_by = app_user_id())
  );

CREATE POLICY assignments_delete ON public.session_assignments
  FOR DELETE TO authenticated
  USING (
    app_user_role() = 'admin'
    OR (app_user_role() = 'coach' AND assigned_by = app_user_id())
  );

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
  raw_payload JSONB, -- §223 : fallback pour get_coach_kpis (raw_payload->>'fatigue')
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
-- coach_manual_swimmers (§126) — nageurs sans compte pour chrono coach
-- Keep in sync with migration 00114_coach_manual_swimmers.sql
-- Note: no FK to auth.users here (no auth schema in test env) — coach_id is plain UUID
-- =============================================================================

CREATE TABLE public.coach_manual_swimmers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coach_manual_swimmers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach_manual_swimmers_select_own"
  ON public.coach_manual_swimmers FOR SELECT
  USING (coach_id = (SELECT auth.uid()));

CREATE POLICY "coach_manual_swimmers_insert_own"
  ON public.coach_manual_swimmers FOR INSERT
  WITH CHECK (coach_id = (SELECT auth.uid()));

CREATE POLICY "coach_manual_swimmers_delete_own"
  ON public.coach_manual_swimmers FOR DELETE
  USING (coach_id = (SELECT auth.uid()));

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

-- =============================================================================
-- Swim inheritance resolver (§144) — training_slots, swimmer_training_slots,
-- training_slot_assignments, swim_sessions_catalog, planned_absences, and the
-- get_swimmer_sessions RPC. Keep in sync with migrations 00128+00129+00130.
-- =============================================================================

CREATE TABLE public.training_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week SMALLINT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  location TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  session_type TEXT NOT NULL DEFAULT 'swim',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.training_slot_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL REFERENCES public.training_slots(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.swimmer_training_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_assignment_id UUID REFERENCES public.training_slot_assignments(id) ON DELETE SET NULL,
  day_of_week SMALLINT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  location TEXT,
  session_type TEXT NOT NULL DEFAULT 'swim',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.swim_sessions_catalog (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  total_distance INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.planned_absences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  reason TEXT,
  scheduled_slot TEXT CHECK (scheduled_slot IN ('morning', 'evening')),
  training_slot_id UUID REFERENCES public.training_slots(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX planned_absences_user_date_slot_unique
  ON public.planned_absences(user_id, date, COALESCE(scheduled_slot, 'all'));

-- RPC get_swimmer_sessions — verbatim body from 00129 migration
CREATE OR REPLACE FUNCTION public.get_swimmer_sessions(
  p_user_id integer,
  p_from date,
  p_to date,
  p_include_drafts boolean DEFAULT false
)
RETURNS TABLE (
  swimmer_slot_id uuid,
  scheduled_date date,
  day_of_week int,
  bucket text,
  slot_start_time time,
  slot_end_time time,
  slot_location text,
  slot_session_type text,
  assignment_id integer,
  assignment_source text,
  assignment_title text,
  assignment_total_km numeric,
  swim_catalog_id integer,
  strength_session_id integer,
  training_slot_id uuid,
  is_absent boolean,
  absence_reason text,
  log_session_id uuid
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
AS $$
DECLARE
  v_has_custom boolean;
  v_group_ids int[];
BEGIN
  SELECT array_agg(DISTINCT gm.group_id)
  INTO v_group_ids
  FROM group_members gm
  JOIN groups g ON g.id = gm.group_id
  WHERE gm.user_id = p_user_id
    AND (NOT g.is_temporary OR g.is_active);

  SELECT EXISTS(
    SELECT 1 FROM swimmer_training_slots
    WHERE user_id = p_user_id AND is_active = true
  ) INTO v_has_custom;

  RETURN QUERY
  WITH
  date_series AS (
    SELECT d::date AS sched_date,
           EXTRACT(ISODOW FROM d)::int AS dow
    FROM generate_series(p_from, p_to, '1 day') d
  ),
  expected_slots AS (
    SELECT
      CASE WHEN v_has_custom THEN sts.id ELSE NULL END AS swimmer_slot_id,
      ds.sched_date,
      ds.dow,
      CASE WHEN EXTRACT(HOUR FROM COALESCE(sts.start_time, ts.start_time)) < 13
           THEN 'morning' ELSE 'evening' END AS bucket,
      COALESCE(sts.start_time, ts.start_time) AS slot_start_time,
      COALESCE(sts.end_time, ts.end_time) AS slot_end_time,
      COALESCE(sts.location, ts.location) AS slot_location,
      COALESCE(sts.session_type, ts.session_type) AS slot_session_type,
      sts.source_assignment_id,
      ts.id AS direct_training_slot_id
    FROM date_series ds
    LEFT JOIN swimmer_training_slots sts
      ON v_has_custom
     AND sts.user_id = p_user_id
     AND sts.is_active = true
     AND sts.day_of_week = ds.dow
    LEFT JOIN training_slots ts
      ON (NOT v_has_custom)
     AND ts.is_active = true
     AND ts.day_of_week = ds.dow
     AND EXISTS(
       SELECT 1 FROM training_slot_assignments tsa
       WHERE tsa.slot_id = ts.id AND tsa.group_id = ANY(v_group_ids)
     )
    WHERE (v_has_custom AND sts.id IS NOT NULL)
       OR (NOT v_has_custom AND ts.id IS NOT NULL)
  ),
  with_source AS (
    SELECT
      es.*,
      COALESCE(
        (SELECT tsa.slot_id FROM training_slot_assignments tsa
         WHERE tsa.id = es.source_assignment_id LIMIT 1),
        (SELECT ts.id FROM training_slots ts
         JOIN training_slot_assignments tsa ON tsa.slot_id = ts.id
         WHERE ts.is_active = true
           AND ts.day_of_week = es.dow
           AND ts.session_type = es.slot_session_type
           AND CASE WHEN EXTRACT(HOUR FROM ts.start_time) < 13 THEN 'morning' ELSE 'evening' END = es.bucket
           AND tsa.group_id = ANY(v_group_ids)
         ORDER BY ABS(EXTRACT(EPOCH FROM (ts.start_time - es.slot_start_time))) ASC
         LIMIT 1),
        es.direct_training_slot_id
      ) AS resolved_training_slot_id
    FROM expected_slots es
  ),
  candidate_assignments AS (
    SELECT
      ws.swimmer_slot_id,
      ws.sched_date,
      ws.dow,
      ws.bucket,
      ws.slot_start_time,
      ws.slot_end_time,
      ws.slot_location,
      ws.slot_session_type,
      ws.resolved_training_slot_id,
      sa.id AS assignment_id,
      CASE
        WHEN sa.target_user_id = p_user_id THEN 'individual'
        WHEN sa.target_subgroup_id = ANY(v_group_ids) THEN 'subgroup'
        WHEN sa.target_group_id = ANY(v_group_ids) THEN 'group'
        ELSE 'none'
      END AS source,
      CASE
        WHEN sa.target_user_id = p_user_id THEN 1
        WHEN sa.target_subgroup_id = ANY(v_group_ids) THEN 2
        WHEN sa.target_group_id = ANY(v_group_ids) THEN 3
        ELSE 4
      END AS priority,
      sa.swim_catalog_id,
      sa.strength_session_id,
      sa.training_slot_id AS sa_training_slot_id,
      COALESCE(ssc.name, 'Séance') AS title,
      ssc.total_distance::numeric AS total_km
    FROM with_source ws
    LEFT JOIN session_assignments sa
      ON sa.scheduled_date = ws.sched_date
     AND sa.status != 'cancelled'
     AND (p_include_drafts OR sa.visible_from IS NULL OR sa.visible_from <= CURRENT_DATE)
     AND (
       sa.target_user_id = p_user_id
       OR (sa.training_slot_id = ws.resolved_training_slot_id AND (sa.target_group_id = ANY(v_group_ids) OR sa.target_subgroup_id = ANY(v_group_ids)))
       OR (sa.training_slot_id IS NULL AND sa.scheduled_slot = ws.bucket AND (sa.target_group_id = ANY(v_group_ids) OR sa.target_subgroup_id = ANY(v_group_ids)))
     )
    LEFT JOIN swim_sessions_catalog ssc ON ssc.id = sa.swim_catalog_id
  ),
  best_assignment AS (
    SELECT DISTINCT ON (ca.swimmer_slot_id, ca.sched_date, ca.bucket)
      ca.*
    FROM candidate_assignments ca
    ORDER BY ca.swimmer_slot_id, ca.sched_date, ca.bucket, ca.priority ASC, ca.assignment_id DESC
  )
  SELECT
    ba.swimmer_slot_id,
    ba.sched_date AS scheduled_date,
    ba.dow AS day_of_week,
    ba.bucket,
    ba.slot_start_time,
    ba.slot_end_time,
    ba.slot_location,
    ba.slot_session_type,
    ba.assignment_id,
    ba.source AS assignment_source,
    ba.title AS assignment_title,
    ba.total_km AS assignment_total_km,
    ba.swim_catalog_id,
    ba.strength_session_id,
    ba.sa_training_slot_id AS training_slot_id,
    EXISTS(
      SELECT 1 FROM planned_absences pa
      WHERE pa.user_id = p_user_id
        AND pa.date = ba.sched_date
        AND (pa.scheduled_slot IS NULL OR pa.scheduled_slot = ba.bucket)
    ) AS is_absent,
    (SELECT pa.reason FROM planned_absences pa
     WHERE pa.user_id = p_user_id
       AND pa.date = ba.sched_date
       AND (pa.scheduled_slot IS NULL OR pa.scheduled_slot = ba.bucket)
     LIMIT 1) AS absence_reason,
    NULL::uuid AS log_session_id
  FROM best_assignment ba
  ORDER BY ba.sched_date, ba.slot_start_time;
END;
$$;

-- =============================================================================
-- swim_planning_* overrides (migration 00131) — individual planning for nageurs
--
-- Mirrors prod policies from migration 00131: SELECT open to authenticated,
-- WRITE restricted to coach/admin only. Athletes must NOT be able to INSERT,
-- UPDATE, or DELETE their own overrides — all writes go through a coach.
--
-- Policies collapse INSERT/UPDATE/DELETE into FOR ALL for test brevity. The
-- invariant tested is "coach/admin can write, athletes cannot".
-- =============================================================================

CREATE TABLE public.swim_planning_week_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id integer NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_type text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, week_start)
);

CREATE TABLE public.swim_planning_slot_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  day_of_week smallint NOT NULL,
  time_slot text NOT NULL,
  filiere text NOT NULL,
  session_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(athlete_id, week_start, day_of_week, time_slot)
);

CREATE TABLE public.swim_planning_week_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_type text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(athlete_id, week_start)
);

ALTER TABLE public.swim_planning_week_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swim_planning_slot_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swim_planning_week_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY swim_planning_week_meta_select ON public.swim_planning_week_meta
  FOR SELECT TO authenticated USING (true);
CREATE POLICY swim_planning_week_meta_write ON public.swim_planning_week_meta
  FOR ALL TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'))
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));

CREATE POLICY swim_planning_slot_overrides_select ON public.swim_planning_slot_overrides
  FOR SELECT TO authenticated USING (true);
CREATE POLICY swim_planning_slot_overrides_write ON public.swim_planning_slot_overrides
  FOR ALL TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'))
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));

CREATE POLICY swim_planning_week_overrides_select ON public.swim_planning_week_overrides
  FOR SELECT TO authenticated USING (true);
CREATE POLICY swim_planning_week_overrides_write ON public.swim_planning_week_overrides
  FOR ALL TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'))
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));

-- =============================================================================
-- strength_planning_* (migration 00136) — group + per-athlete overrides
--
-- Mirrors prod policies from migration 00136: SELECT open to authenticated,
-- WRITE restricted to coach/admin only. Athletes must NOT be able to INSERT,
-- UPDATE, or DELETE slots or overrides — all writes go through a coach.
-- =============================================================================

CREATE TABLE public.strength_planning_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id integer NOT NULL,
  week_start date NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  time_slot text NOT NULL CHECK (time_slot IN ('morning', 'evening')),
  session_template_id integer NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, week_start, day_of_week, time_slot)
);

CREATE TABLE public.strength_planning_slot_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id integer NOT NULL,
  week_start date NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  time_slot text NOT NULL CHECK (time_slot IN ('morning', 'evening')),
  session_template_id integer NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(athlete_id, week_start, day_of_week, time_slot)
);

CREATE TABLE public.strength_planning_week_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id integer NOT NULL,
  week_start date NOT NULL,
  week_type text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, week_start)
);

CREATE TABLE public.strength_planning_week_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id integer NOT NULL,
  week_start date NOT NULL,
  week_type text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(athlete_id, week_start)
);

ALTER TABLE public.strength_planning_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strength_planning_slot_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strength_planning_week_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strength_planning_week_overrides ENABLE ROW LEVEL SECURITY;

-- strength_planning_slots
CREATE POLICY strength_planning_slots_select ON public.strength_planning_slots
  FOR SELECT TO authenticated USING (true);
CREATE POLICY strength_planning_slots_write ON public.strength_planning_slots
  FOR ALL TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'))
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));

-- strength_planning_slot_overrides
CREATE POLICY strength_planning_slot_overrides_select ON public.strength_planning_slot_overrides
  FOR SELECT TO authenticated USING (true);
CREATE POLICY strength_planning_slot_overrides_write ON public.strength_planning_slot_overrides
  FOR ALL TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'))
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));

-- strength_planning_week_meta
CREATE POLICY strength_planning_week_meta_select ON public.strength_planning_week_meta
  FOR SELECT TO authenticated USING (true);
CREATE POLICY strength_planning_week_meta_write ON public.strength_planning_week_meta
  FOR ALL TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'))
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));

-- strength_planning_week_overrides
CREATE POLICY strength_planning_week_overrides_select ON public.strength_planning_week_overrides
  FOR SELECT TO authenticated USING (true);
CREATE POLICY strength_planning_week_overrides_write ON public.strength_planning_week_overrides
  FOR ALL TO authenticated
  USING ((SELECT app_user_role()) IN ('coach','admin'))
  WITH CHECK ((SELECT app_user_role()) IN ('coach','admin'));

-- =============================================================================
-- save_strength_run_atomic — authz-only stub (§174 P0/P1 #5, migration 00146)
--
-- The full RPC has heavy dependencies (one_rm_records, full strength_set_logs
-- column set, ON CONFLICT machinery) that we have not ported to this minimal
-- test schema. To keep regression coverage on the *security* check (which is
-- what 00146 added), we mirror only the authz block as a pure function that
-- raises the same exceptions as prod when authz fails, and returns 'ok' when
-- authz passes. Tests assert the boundary behavior; insert correctness is
-- covered by JS unit tests + manual smoke.
--
-- IMPORTANT: keep `_test_save_strength_run_authz` synced with the IF blocks
-- in supabase/migrations/00146_save_strength_run_assignment_authz.sql.
-- =============================================================================
CREATE OR REPLACE FUNCTION public._test_save_strength_run_authz(
  p_athlete_id integer,
  p_assignment_id integer
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id int := app_user_id();
  v_caller_role text := app_user_role();
  v_assignment_target int;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF p_athlete_id IS NULL THEN
    RAISE EXCEPTION 'athlete_id is required' USING ERRCODE = '22023';
  END IF;

  IF p_athlete_id <> v_caller_id
     AND v_caller_role NOT IN ('coach', 'admin') THEN
    RAISE EXCEPTION 'forbidden: cannot save run for another athlete' USING ERRCODE = '42501';
  END IF;

  IF p_assignment_id IS NOT NULL THEN
    SELECT target_user_id INTO v_assignment_target
      FROM session_assignments
     WHERE id = p_assignment_id;

    IF v_assignment_target IS NULL THEN
      IF v_caller_role NOT IN ('coach', 'admin') THEN
        RAISE EXCEPTION 'forbidden: cannot mark non-direct assignment completed'
          USING ERRCODE = '42501';
      END IF;
    ELSIF v_assignment_target <> p_athlete_id
          AND v_caller_role <> 'admin' THEN
      RAISE EXCEPTION 'forbidden: assignment % does not target athlete %',
        p_assignment_id, p_athlete_id USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN 'ok';
END;
$$;

GRANT EXECUTE ON FUNCTION public._test_save_strength_run_authz(integer, integer) TO authenticated;

-- =============================================================================
-- §184 — Coach Pace Calculator + Mon équipe
-- Keep in sync with migration 00148_pace_calculator_and_team.sql
-- Note: no FK to auth.users (no auth schema in test env) — coach_id is plain UUID
-- =============================================================================

-- (a) Étendre coach_manual_swimmers
ALTER TABLE public.coach_manual_swimmers
  ADD COLUMN IF NOT EXISTS birthdate date,
  ADD COLUMN IF NOT EXISTS sex char(1) CHECK (sex IN ('M','F'));

CREATE POLICY "coach_manual_swimmers_update_own"
  ON public.coach_manual_swimmers FOR UPDATE
  USING (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));

-- (b) coach_pace_zones — §186 v2 : multi-row par (coach_id, event_family, zone)
CREATE TABLE IF NOT EXISTS public.coach_pace_zones (
  coach_id     uuid NOT NULL,
  event_family text NOT NULL CHECK (event_family IN ('50m','100m','200m','400m','800m_1500m')),
  zone         text NOT NULL CHECK (zone IN ('V0','V1','V2','V3','V4','MAX')),
  k_value      numeric(5,4) NOT NULL CHECK (k_value > 0 AND k_value <= 1),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_id, event_family, zone)
);
ALTER TABLE public.coach_pace_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_pace_zones_select_own"
  ON public.coach_pace_zones FOR SELECT
  USING (coach_id = (SELECT auth.uid()));
CREATE POLICY "coach_pace_zones_insert_own"
  ON public.coach_pace_zones FOR INSERT
  WITH CHECK (coach_id = (SELECT auth.uid()));
CREATE POLICY "coach_pace_zones_update_own"
  ON public.coach_pace_zones FOR UPDATE
  USING  (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));
CREATE POLICY "coach_pace_zones_delete_own"
  ON public.coach_pace_zones FOR DELETE
  USING (coach_id = (SELECT auth.uid()));

-- (b2) coach_stroke_adjustments — §186 : override coach des mS par nage/famille
CREATE TABLE IF NOT EXISTS public.coach_stroke_adjustments (
  coach_id     uuid NOT NULL,
  stroke       text NOT NULL CHECK (stroke IN ('crawl','dos','brasse','papillon')),
  event_family text NOT NULL CHECK (event_family IN ('50m','100m','200m','400m','800m_1500m')),
  m_value      numeric(5,4) NOT NULL CHECK (m_value >= -0.20 AND m_value <= 0.20),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_id, stroke, event_family)
);
ALTER TABLE public.coach_stroke_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_stroke_adj_select_own"
  ON public.coach_stroke_adjustments FOR SELECT
  USING (coach_id = (SELECT auth.uid()));
CREATE POLICY "coach_stroke_adj_insert_own"
  ON public.coach_stroke_adjustments FOR INSERT
  WITH CHECK (coach_id = (SELECT auth.uid()));
CREATE POLICY "coach_stroke_adj_update_own"
  ON public.coach_stroke_adjustments FOR UPDATE
  USING (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));
CREATE POLICY "coach_stroke_adj_delete_own"
  ON public.coach_stroke_adjustments FOR DELETE
  USING (coach_id = (SELECT auth.uid()));

-- (c) coach_pace_targets
CREATE TABLE public.coach_pace_targets (
  id                   uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id             uuid    NOT NULL,
  swimmer_account_id   bigint  REFERENCES public.users(id) ON DELETE CASCADE,
  swimmer_manual_id    uuid    REFERENCES public.coach_manual_swimmers(id) ON DELETE CASCADE,
  stroke               text    NOT NULL CHECK (stroke IN ('NL','Dos','Brasse','Pap','4N')),
  target_distance_m    int     NOT NULL CHECK (target_distance_m IN (50,100,200,400,800,1500)),
  target_time_ms       int     NOT NULL CHECK (target_time_ms > 0),
  target_pool_size     text    NOT NULL DEFAULT '50m' CHECK (target_pool_size IN ('25m','50m')),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK ((swimmer_account_id IS NULL) <> (swimmer_manual_id IS NULL))
);
CREATE UNIQUE INDEX uq_pace_targets_account
  ON public.coach_pace_targets (coach_id, swimmer_account_id, stroke, target_distance_m)
  WHERE swimmer_account_id IS NOT NULL;
CREATE UNIQUE INDEX uq_pace_targets_manual
  ON public.coach_pace_targets (coach_id, swimmer_manual_id, stroke, target_distance_m)
  WHERE swimmer_manual_id IS NOT NULL;
ALTER TABLE public.coach_pace_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_pace_targets_all_own"
  ON public.coach_pace_targets FOR ALL
  USING  (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));

-- (d) pace_share_links
CREATE TABLE public.pace_share_links (
  token                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id             uuid    NOT NULL,
  swimmer_account_id   bigint  REFERENCES public.users(id) ON DELETE CASCADE,
  swimmer_manual_id    uuid    REFERENCES public.coach_manual_swimmers(id) ON DELETE CASCADE,
  expires_at           timestamptz NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK ((swimmer_account_id IS NULL) <> (swimmer_manual_id IS NULL))
);
ALTER TABLE public.pace_share_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pace_share_links_owner_all"
  ON public.pace_share_links FOR ALL
  USING  (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));

-- §186 — RPC get_pace_share_payload v2 (mirror of migration 00152)
-- SECURITY DEFINER bypasses RLS — callable by anon.
-- Note: no user_profiles in test schema → swimmer_sex NULL for account swimmers.
CREATE OR REPLACE FUNCTION get_pace_share_payload(token_in uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link          record;
  swimmer_name  text;
  swimmer_sex   text;
  zones_v2      jsonb;
  targets       jsonb;
BEGIN
  SELECT * INTO link FROM pace_share_links
   WHERE token = token_in AND expires_at > now();
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF link.swimmer_account_id IS NOT NULL THEN
    SELECT display_name INTO swimmer_name FROM users WHERE id = link.swimmer_account_id;
    swimmer_sex := NULL;
  ELSE
    SELECT display_name, sex
      INTO swimmer_name, swimmer_sex
      FROM coach_manual_swimmers WHERE id = link.swimmer_manual_id;
  END IF;

  SELECT jsonb_object_agg(event_family, family_zones) INTO zones_v2
    FROM (
      SELECT event_family, jsonb_object_agg(zone, k_value) AS family_zones
        FROM coach_pace_zones WHERE coach_id = link.coach_id
        GROUP BY event_family
    ) t;

  SELECT jsonb_agg(t) INTO targets
    FROM coach_pace_targets t
   WHERE coach_id = link.coach_id
     AND (
       (swimmer_account_id IS NOT NULL AND swimmer_account_id = link.swimmer_account_id)
       OR
       (swimmer_manual_id IS NOT NULL AND swimmer_manual_id = link.swimmer_manual_id)
     );

  RETURN jsonb_build_object(
    'swimmer_name', swimmer_name,
    'swimmer_sex',  swimmer_sex,
    'zones_v2',     COALESCE(zones_v2, '{}'::jsonb),
    'targets',      COALESCE(targets,  '[]'::jsonb)
  );
END;
$$;

-- =============================================================================
-- RPC get_coach_kpis (§223) — verbatim body from migration 00157.
-- Agrège les valeurs de fatigue (sessions + runs) par athlète sur une fenêtre.
-- security invoker → RLS héritée des policies dim_sessions + strength_session_runs.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_coach_kpis(
  athlete_ids int[],
  from_date date,
  to_date date
)
RETURNS TABLE (
  athlete_id int,
  fatigue_values numeric[]
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  with swim_fatigue as (
    select s.athlete_id, coalesce(s.fatigue, s.rpe)::numeric as v
    from public.dim_sessions s
    where s.athlete_id = any(athlete_ids)
      and s.session_date between from_date and to_date
      and coalesce(s.fatigue, s.rpe) is not null
  ),
  strength_fatigue as (
    select r.athlete_id,
      coalesce(
        r.fatigue::numeric,
        nullif(r.raw_payload->>'fatigue', '')::numeric
      ) as v
    from public.strength_session_runs r
    where r.athlete_id = any(athlete_ids)
      and coalesce(r.completed_at, r.started_at)
          between from_date::timestamptz
              and (to_date + interval '1 day')::timestamptz
      and (r.fatigue is not null or r.raw_payload->>'fatigue' is not null)
  ),
  combined as (
    select athlete_id, v from swim_fatigue
    union all
    select athlete_id, v from strength_fatigue
  )
  select
    a.id as athlete_id,
    coalesce(
      array_agg(c.v) filter (where c.v is not null),
      '{}'::numeric[]
    ) as fatigue_values
  from unnest(athlete_ids) as a(id)
  left join combined c on c.athlete_id = a.id
  group by a.id;
$$;
GRANT EXECUTE ON FUNCTION get_pace_share_payload(uuid) TO anon, authenticated;

-- =============================================================================
-- strength_assessments + strength_kpi_measurements (§285) — Chantier B
-- "Bilan Muscu → Mésocycle". Keep in sync with migration 00163_strength_assessments.sql.
--
-- RLS : le nageur possède ses lignes (`_own` keyed on athlete_id = app_user_id()).
-- L'accès coach/admin est élargi à FOR ALL (`_coach`) — le coach renseigne
-- physical_tests et valide les mesures KPI (coach_reviewed). Accès club entier.
--
-- NOTE: la migration prod crée aussi un trigger `strength_assessments_set_updated_at`
-- via la fonction `set_updated_at_timestamp()` (créée en 00162). Cette fonction
-- n'existe PAS dans ce schéma de test minimal — le trigger est OMIS volontairement,
-- il est sans rapport avec les policies RLS testées ici.
-- =============================================================================

CREATE TABLE public.strength_assessments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id       INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  coach_id         INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'questionnaire_pending'
                     CHECK (status IN ('questionnaire_pending','bilan_pending','completed')),
  questionnaire    JSONB,
  physical_tests   JSONB,
  bucket_scores    JSONB,
  data_confidence  TEXT NOT NULL DEFAULT 'full'
                     CHECK (data_confidence IN ('full','partial','low')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX strength_assessments_athlete_idx
  ON public.strength_assessments (athlete_id, created_at DESC);

CREATE TABLE public.strength_kpi_measurements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id      INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kpi_key         TEXT NOT NULL CHECK (kpi_key IN (
                    'vertical_jump','broad_jump','imtp',
                    'weighted_pullup','medball_vertical_throw')),
  value           NUMERIC NOT NULL CHECK (value >= 0),
  unit            TEXT NOT NULL,
  attempts        JSONB,
  measured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  measured_by     INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  assisted_by     INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  source          TEXT NOT NULL CHECK (source IN ('wizard_athlete','wizard_coach')),
  coach_reviewed  BOOLEAN NOT NULL DEFAULT false,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX strength_kpi_measurements_athlete_idx
  ON public.strength_kpi_measurements (athlete_id, kpi_key, measured_at DESC);

-- RLS — strength_assessments
ALTER TABLE public.strength_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY strength_assessments_own ON public.strength_assessments
  FOR ALL TO authenticated
  USING (athlete_id = app_user_id())
  WITH CHECK (athlete_id = app_user_id());

CREATE POLICY strength_assessments_coach ON public.strength_assessments
  FOR ALL TO authenticated
  USING (app_user_role() IN ('coach','admin'))
  WITH CHECK (app_user_role() IN ('coach','admin'));

-- RLS — strength_kpi_measurements
ALTER TABLE public.strength_kpi_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY strength_kpi_measurements_own ON public.strength_kpi_measurements
  FOR ALL TO authenticated
  USING (athlete_id = app_user_id())
  WITH CHECK (athlete_id = app_user_id());

CREATE POLICY strength_kpi_measurements_coach ON public.strength_kpi_measurements
  FOR ALL TO authenticated
  USING (app_user_role() IN ('coach','admin'))
  WITH CHECK (app_user_role() IN ('coach','admin'));

-- =============================================================================
-- strength_periodization_templates (§292) — Chantier A
-- "Bilan Muscu → Mésocycle". Référentiel des templates de périodisation.
-- Keep in sync with migration 00166_strength_periodization_templates.sql
-- and 00167 (variable-duration: kind + min_week_count + max_week_count,
-- week_count removed).
--
-- RLS : lecture monde (tout authentifié) via `spt_select` ; écriture
-- coach/admin uniquement via `spt_write` (FOR ALL, USING + WITH CHECK).
--
-- NOTE: la migration prod crée aussi un trigger
-- `strength_periodization_templates_set_updated_at` via la fonction
-- `set_updated_at_timestamp()` (créée en 00162). Cette fonction n'existe PAS
-- dans ce schéma de test minimal — le trigger est OMIS volontairement, il est
-- sans rapport avec les policies RLS testées ici (cf. §285 plus haut).
-- =============================================================================

CREATE TABLE public.strength_periodization_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_group     TEXT NOT NULL,
  name            TEXT NOT NULL,
  structure       JSONB NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('season','inter_competition')),
  min_week_count  INTEGER NOT NULL CHECK (min_week_count > 0 AND min_week_count <= 24),
  max_week_count  INTEGER NOT NULL CHECK (max_week_count > 0 AND max_week_count <= 24),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (min_week_count <= max_week_count)
);

ALTER TABLE public.strength_periodization_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY spt_select ON public.strength_periodization_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY spt_write ON public.strength_periodization_templates
  FOR ALL TO authenticated
  USING (app_user_role() IN ('coach','admin'))
  WITH CHECK (app_user_role() IN ('coach','admin'));
