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
  (4, 'Diana Admin',   'diana admin',   'admin');

-- Reset sequence past seeded IDs
SELECT setval('public.users_id_seq', 100, false);

INSERT INTO public.dim_sessions (id, athlete_id, athlete_name, session_date, time_slot, duration, rpe) VALUES
  (1, 1, 'Alice Athlete', '2026-04-01', 'morning', 60, 5),
  (2, 1, 'Alice Athlete', '2026-04-02', 'evening', 75, 6),
  (3, 2, 'Bob Athlete',   '2026-04-01', 'morning', 60, 4);

SELECT setval('public.dim_sessions_id_seq', 100, false);
