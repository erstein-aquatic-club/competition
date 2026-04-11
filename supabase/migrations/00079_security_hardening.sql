-- Migration 00079: Security hardening
-- Fixes: SECURITY DEFINER view, mutable search_path functions, overly permissive RLS

-- 1.1 Recreate swim_records_comp without SECURITY DEFINER
DROP VIEW IF EXISTS public.swim_records_comp;
CREATE VIEW public.swim_records_comp
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (user_id, event_code, pool_length)
  id,
  user_id AS athlete_id,
  event_code AS event_name,
  pool_length,
  time_seconds,
  competition_date AS record_date,
  competition_name AS notes,
  ffn_points,
  'comp'::text AS record_type
FROM swimmer_performances sp
WHERE user_id IS NOT NULL AND time_seconds IS NOT NULL AND time_seconds > 0::double precision
ORDER BY user_id, event_code, pool_length, time_seconds;

-- 1.2 Fix search_path on all functions missing it
ALTER FUNCTION public.app_user_id() SET search_path = public;
ALTER FUNCTION public.app_user_role() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.auto_notify_competition_assignment() SET search_path = public;
ALTER FUNCTION public.auto_notify_interview_created() SET search_path = public;
ALTER FUNCTION public.auto_notify_interview_transition() SET search_path = public;
ALTER FUNCTION public.auto_notify_session_assignment() SET search_path = public;
ALTER FUNCTION public.auto_notify_slot_override() SET search_path = public;
ALTER FUNCTION public.auto_notify_swimmer_comment() SET search_path = public;
ALTER FUNCTION public.generate_swim_share_token(integer) SET search_path = public;
ALTER FUNCTION public.sync_group_members_on_profile() SET search_path = public;
ALTER FUNCTION public.send_wellness_morning_push() SET search_path = public;
ALTER FUNCTION public.get_strength_history_aggregate(integer, text, date, date, integer, integer, text) SET search_path = public;
ALTER FUNCTION public.get_upcoming_birthdays(integer) SET search_path = public;
ALTER FUNCTION public.log_coach_swimmer_removal() SET search_path = public;
ALTER FUNCTION public.notify_push_on_target_insert() SET search_path = public;

-- 1.3 Restrict admin_audit_log INSERT to service_role / trigger owners only
DROP POLICY IF EXISTS "System can insert audit log" ON public.admin_audit_log;
CREATE POLICY "System can insert audit log" ON public.admin_audit_log
  FOR INSERT
  WITH CHECK (current_setting('role') = 'service_role');
