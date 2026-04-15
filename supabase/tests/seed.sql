-- =============================================================================
-- supabase/tests/seed.sql
--
-- Test fixtures — applied AFTER schema.sql, BEFORE each test suite.
-- Keep deterministic IDs for stable test assertions.
-- =============================================================================

INSERT INTO public.users (id, display_name, display_name_lower, role) VALUES
  (1, 'Alice Athlete', 'alice athlete', 'athlete'),
  (2, 'Bob Athlete',   'bob athlete',   'athlete'),
  (3, 'Carol Coach',   'carol coach',   'coach'),
  (4, 'Diana Admin',   'diana admin',   'admin'),
  (5, 'Eve Coach',     'eve coach',     'coach');

-- Reset sequence past seeded IDs
SELECT setval('public.users_id_seq', 100, false);

INSERT INTO public.dim_sessions (id, athlete_id, athlete_name, session_date, time_slot, duration, rpe) VALUES
  (1, 1, 'Alice Athlete', '2026-04-01', 'morning', 60, 5),
  (2, 1, 'Alice Athlete', '2026-04-02', 'evening', 75, 6),
  (3, 2, 'Bob Athlete',   '2026-04-01', 'morning', 60, 4);

SELECT setval('public.dim_sessions_id_seq', 100, false);

-- Coach-swimmer assignments : Carol is Alice's principal coach.
-- Bob and Eve have no CSA link (used to test the unassigned-coach branch).
INSERT INTO public.coach_swimmer_assignments (id, coach_id, swimmer_id, assigned_by) VALUES
  (1, 3, 1, 4);  -- Carol → Alice, assigned by Diana (admin)

SELECT setval('public.coach_swimmer_assignments_id_seq', 100, false);

-- Interviews fixtures — see docs/rls-testing.md for matrix explanation
-- created_by is a UUID matching what auth.uid() returns for each coach JWT.
-- Deterministic UUIDs for readability: 000...N where N = user.id
INSERT INTO public.interviews (id, athlete_id, status, date, created_by) VALUES
  -- i1: Carol creates draft for Alice — Alice and Carol should see; Eve should NOT
  ('10000000-0000-0000-0000-000000000001', 1, 'draft_coach', '2026-04-01', '00000000-0000-0000-0000-000000000003'),
  -- i2: Eve creates sent for Bob — Bob and Eve see; Carol should NOT (Bob not in her CSA)
  ('10000000-0000-0000-0000-000000000002', 2, 'sent',        '2026-04-02', '00000000-0000-0000-0000-000000000005'),
  -- i3: Eve creates sent for Alice — Alice, Eve and Carol (via CSA) see; Bob does NOT
  ('10000000-0000-0000-0000-000000000003', 1, 'sent',        '2026-04-03', '00000000-0000-0000-0000-000000000005'),
  -- i4: Eve creates archived for Bob — Bob does NOT see (status filter); Eve does (created_by)
  ('10000000-0000-0000-0000-000000000004', 2, 'archived',    '2026-04-04', '00000000-0000-0000-0000-000000000005');
