-- 00229_strength_planning_realtime.sql
-- Make newly published plans observable immediately on the swimmer's PWA.
-- Actual data always comes from a fresh Supabase REST query (never from WAL).
--
-- Verified on production (2026-11-13): these tables have RLS enabled.
-- strength_mesocycles and training_plan_applications have role/target SELECT
-- policies. The existing planning-slot tables currently use broad SELECT
-- policies; we only subscribe to athlete/group-filtered rows client-side.
-- This migration changes no RLS policy and grants no new table privileges.
--
-- Idempotent for projects where a table was already enabled manually in
-- Database > Publications > supabase_realtime.
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'strength_mesocycles',
    'training_plan_applications',
    'strength_planning_slot_overrides',
    'strength_planning_week_overrides',
    'strength_planning_slots'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = v_table
    ) THEN
      EXECUTE format(
        'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
        v_table
      );
    END IF;
  END LOOP;
END
$$;
