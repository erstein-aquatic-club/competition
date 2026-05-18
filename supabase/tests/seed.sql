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

-- ── Strength session runs + set logs ─────────────────
INSERT INTO public.strength_session_runs (id, athlete_id, status) VALUES
  (1, 1, 'completed'),   -- Alice's run
  (2, 2, 'completed');   -- Bob's run
SELECT setval('public.strength_session_runs_id_seq', 100, false);

INSERT INTO public.strength_set_logs (id, run_id, exercise_id, set_index, reps, weight) VALUES
  (1, 1, 10, 1, 8, 40.0),   -- log in Alice's run
  (2, 1, 10, 2, 8, 42.5),   -- log in Alice's run
  (3, 2, 10, 1, 10, 35.0);  -- log in Bob's run
SELECT setval('public.strength_set_logs_id_seq', 100, false);

-- ── Competition checklists + checks ──────────────────
INSERT INTO public.competitions (id, name, date) VALUES
  ('20000000-0000-0000-0000-000000000001', 'Meeting Printemps', '2026-05-01');

INSERT INTO public.competition_checklists (id, competition_id, athlete_id, checklist_template_id) VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, '40000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 2, '40000000-0000-0000-0000-000000000001');

INSERT INTO public.competition_checklist_checks (id, competition_checklist_id, checklist_item_id, checked) VALUES
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', false),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', true),
  ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', false);

-- ═════════════════════════════════════════════════════════════════════════════
-- Swim inheritance fixtures (§144) — see get_swimmer_sessions.test.ts
-- ═════════════════════════════════════════════════════════════════════════════

-- Actors:
--   • Alice (id=1, athlete) — has custom swimmer_training_slots; member of Cadets (group 1)
--   • Bob   (id=2, athlete) — NO custom slots; member of Juniors (group 2) -> uses group training_slots
--   • Eve   (id=5, coach)   — we also add athlete-like fixtures with id=5 for "attr fallback"

-- Dates (2026-04-13 = Monday, ISO DOW 1):
--   • 2026-04-13 Mon (dow=1)
--   • 2026-04-14 Tue (dow=2)
--   • 2026-04-15 Wed (dow=3)
--   • 2026-04-16 Thu (dow=4)
--   • 2026-04-17 Fri (dow=5)

-- Mark Cadets as permanent (default is is_temporary=false, is_active=true)
-- + add temp archived group to cover §139 regression: Alice historically was in this temp group.
INSERT INTO public.groups (id, name, is_active, is_temporary) VALUES
  (3, 'StageInactive', FALSE, TRUE);

INSERT INTO public.group_members (id, group_id, user_id) VALUES
  (3, 3, 1);  -- Alice once part of archived temp group (should be filtered out)

-- ── training_slots (group-owned slots) ──────────────────
-- ts1 Mon 09:00 morning swim (Cadets)  -> Alice's custom slot Mon 09:00 matches exactly
-- ts2 Tue 18:00 evening swim (Cadets)  -> Alice's custom slot Tue 18:00 matches exactly
-- ts3 Wed 18:00 evening swim (Cadets)  -> Alice has NO custom slot on Wed (bucket mismatch test)
-- ts4 Thu 18:00 evening swim (Cadets)  -> Alice has custom slot Thu MORNING (bucket differs)
-- ts5 Fri 17:00 evening swim (Juniors) -> Bob (no custom) inherits from here
-- ts6 Mon 09:30 morning swim (Cadets)  -> attribute fallback target for Alice's custom Mon
INSERT INTO public.training_slots (id, day_of_week, start_time, end_time, location, is_active, session_type) VALUES
  ('70000000-0000-0000-0000-000000000001', 1, '09:00:00', '10:30:00', 'PiscineA', TRUE, 'swim'),
  ('70000000-0000-0000-0000-000000000002', 2, '18:00:00', '19:30:00', 'PiscineA', TRUE, 'swim'),
  ('70000000-0000-0000-0000-000000000003', 3, '18:00:00', '19:30:00', 'PiscineA', TRUE, 'swim'),
  ('70000000-0000-0000-0000-000000000004', 4, '18:00:00', '19:30:00', 'PiscineA', TRUE, 'swim'),
  ('70000000-0000-0000-0000-000000000005', 5, '17:00:00', '18:30:00', 'PiscineB', TRUE, 'swim'),
  ('70000000-0000-0000-0000-000000000006', 1, '09:30:00', '11:00:00', 'PiscineA', TRUE, 'swim');

INSERT INTO public.training_slot_assignments (id, slot_id, group_id) VALUES
  ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 1),  -- ts1 → Cadets
  ('80000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', 1),  -- ts2 → Cadets
  ('80000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000003', 1),  -- ts3 → Cadets
  ('80000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000004', 1),  -- ts4 → Cadets
  ('80000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000005', 2),  -- ts5 → Juniors
  ('80000000-0000-0000-0000-000000000006', '70000000-0000-0000-0000-000000000006', 1);  -- ts6 → Cadets

-- ── swimmer_training_slots (Alice's custom) ──────────────
-- sts1 Mon 09:00 swim → source_assignment_id = tsa1 (exact match)
-- sts2 Tue 18:00 swim → source_assignment_id = tsa2 (exact match)
-- sts3 Thu 09:00 swim (MORNING) → no source; group session Thu is EVENING → bucket mismatch
-- sts4 Mon 09:30 swim → source_assignment_id NULL (attribute fallback to ts6)
INSERT INTO public.swimmer_training_slots (id, user_id, source_assignment_id, day_of_week, start_time, end_time, location, is_active, session_type) VALUES
  ('90000000-0000-0000-0000-000000000001', 1, '80000000-0000-0000-0000-000000000001', 1, '09:00:00', '10:30:00', 'PiscineA', TRUE, 'swim'),
  ('90000000-0000-0000-0000-000000000002', 1, '80000000-0000-0000-0000-000000000002', 2, '18:00:00', '19:30:00', 'PiscineA', TRUE, 'swim'),
  ('90000000-0000-0000-0000-000000000003', 1, NULL,                                   4, '09:00:00', '10:30:00', 'PiscineA', TRUE, 'swim');

-- ── swim_sessions_catalog ──────────────────────────────
INSERT INTO public.swim_sessions_catalog (id, name, total_distance) VALUES
  (10, 'Aerobic 4k',     4000),
  (11, 'Endurance 3k',   3000),
  (12, 'Speed Sets',     2500),
  (13, 'Perso Alice',    3500),
  (14, 'Subgroup Work',  3200);
SELECT setval('public.swim_sessions_catalog_id_seq', 100, false);

-- NOTE: session_assignments rows for inheritance tests are inserted at runtime
-- inside get_swimmer_sessions.test.ts via asServiceRole (see fixtures there).
-- This keeps the seed stable for session_assignments.test.ts which expects only 5 rows.

-- Add subgroup 10 as a group entry so v_group_ids includes it (RPC logic uses ANY(v_group_ids) for subgroup match).
-- NOTE: must be inserted BEFORE the group_members row referencing it.
INSERT INTO public.groups (id, name, is_active, is_temporary) VALUES
  (10, 'CadetsSubA', TRUE, FALSE);

-- Alice is also member of subgroup 10 (via group_members, row id=10)
INSERT INTO public.group_members (id, group_id, user_id) VALUES
  (10, 10, 1);

-- ── planned_absences ──────────────────────────────────
-- pa1: Alice absent evening only on Tue 2026-04-14 → morning slot not flagged (no morning slot anyway)
-- pa2: Alice absent whole day on Mon 2026-04-13 (NULL scheduled_slot)
INSERT INTO public.planned_absences (id, user_id, date, reason, scheduled_slot) VALUES
  (1, 1, '2026-04-14', 'Doctor',  'evening'),
  (2, 1, '2026-04-13', 'Trip',    NULL);
SELECT setval('public.planned_absences_id_seq', 100, false);

-- Extra: Bob has no group_members row for subgroups; no custom slots.
-- Bob inherits ts5 via group_members (group 2 = Juniors) and sa18 is his group session.

-- ═════════════════════════════════════════════════════════════════════════════
-- §285 — strength_assessments + strength_kpi_measurements
-- See strength-assessments.test.ts. Deterministic UUIDs: last segment encodes
-- the owning athlete id (…1 = Alice, …2 = Bob).
-- ═════════════════════════════════════════════════════════════════════════════

-- sa-a1: Alice's assessment   | sa-b1: Bob's assessment
INSERT INTO public.strength_assessments (id, athlete_id, status) VALUES
  ('a0000000-0000-0000-0000-000000000001', 1, 'questionnaire_pending'),
  ('a0000000-0000-0000-0000-000000000002', 2, 'questionnaire_pending');

-- km-a1: Alice's KPI measurement | km-b1: Bob's KPI measurement
INSERT INTO public.strength_kpi_measurements
  (id, athlete_id, kpi_key, value, unit, source, coach_reviewed) VALUES
  ('b0000000-0000-0000-0000-000000000001', 1, 'vertical_jump', 42.0, 'cm', 'wizard_athlete', false),
  ('b0000000-0000-0000-0000-000000000002', 2, 'vertical_jump', 38.0, 'cm', 'wizard_athlete', false);

-- ═════════════════════════════════════════════════════════════════════════════
-- §292 — strength_periodization_templates
-- See strength-periodization-templates.test.ts. World-readable referential:
-- one seeded template lets the swimmer-CAN-SELECT test assert a real row.
-- ═════════════════════════════════════════════════════════════════════════════
INSERT INTO public.strength_periodization_templates
  (id, event_group, name, structure, kind, min_week_count, max_week_count) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'sprint', 'Sprint 8 semaines',
   '{"weeks": []}'::jsonb, 'season', 8, 12);
