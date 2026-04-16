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

-- ── Groups + memberships ─────────────────────────────
INSERT INTO public.groups (id, name) VALUES (1, 'Cadets'), (2, 'Juniors');
SELECT setval('public.groups_id_seq', 100, false);

INSERT INTO public.group_members (id, group_id, user_id) VALUES
  (1, 1, 1),  -- Alice in Cadets
  (2, 2, 2);  -- Bob in Juniors
SELECT setval('public.group_members_id_seq', 100, false);

-- ── Session assignments (§85/§101) ───────────────────
-- sa1: direct to Alice, visible now (visible_from NULL)
-- sa2: direct to Alice, FUTURE visible_from (hidden from athlete)
-- sa3: group Cadets, visible now → Alice sees via group_members
-- sa4: group Juniors, visible now → Bob sees, Alice does NOT
-- sa5: created by Carol, no target → Carol sees (assigned_by), nobody else
INSERT INTO public.session_assignments (id, assignment_type, target_user_id, target_group_id, assigned_by, scheduled_date, visible_from) VALUES
  (1, 'swim', 1,    NULL, 3, '2026-04-01', NULL),
  (2, 'swim', 1,    NULL, 3, '2026-04-02', '2030-01-01'),
  (3, 'swim', NULL,  1,   3, '2026-04-03', NULL),
  (4, 'swim', NULL,  2,   3, '2026-04-04', NULL),
  (5, 'swim', NULL, NULL, 3, '2026-04-05', NULL);
SELECT setval('public.session_assignments_id_seq', 100, false);

-- ── Notifications + targets (§16 fix, §79 push) ─────
INSERT INTO public.notifications (id, title, type, created_by) VALUES
  (1, 'Séance demain', 'session_reminder', 3);
SELECT setval('public.notifications_id_seq', 100, false);

-- nt1: direct to Alice
-- nt2: group Cadets → Alice sees via group_members
-- nt3: group Juniors → Bob sees, Alice does NOT
-- nt4: direct to Bob
INSERT INTO public.notification_targets (id, notification_id, target_user_id, target_group_id) VALUES
  (1, 1, 1,    NULL),
  (2, 1, NULL, 1),
  (3, 1, NULL, 2),
  (4, 1, 2,    NULL);
SELECT setval('public.notification_targets_id_seq', 100, false);
