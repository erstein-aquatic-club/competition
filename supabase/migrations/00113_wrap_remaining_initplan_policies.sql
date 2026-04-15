-- §123 — Wrap les 4 policies RLS restantes détectées par auth_rls_initplan advisor.
-- Pattern identique à §117 : remplacer auth.<fn>() / current_setting() par (select ...)
-- pour évaluation unique au lieu de per-row.

-- 1. push_subscriptions / Service role full access
DROP POLICY IF EXISTS "Service role full access" ON public.push_subscriptions;
CREATE POLICY "Service role full access" ON public.push_subscriptions
  AS PERMISSIVE FOR ALL TO public
  USING ((select auth.role()) = 'service_role');

-- 2. admin_audit_log / Staff can view audit log
DROP POLICY IF EXISTS "Staff can view audit log" ON public.admin_audit_log;
CREATE POLICY "Staff can view audit log" ON public.admin_audit_log
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = ((select current_setting('request.jwt.claims', true))::json ->> 'app_user_id')::integer
      AND u.role = ANY (ARRAY['admin','coach','comite'])
  ));

-- 3. notification_log / Coaches can view their notification history
DROP POLICY IF EXISTS "Coaches can view their notification history" ON public.notification_log;
CREATE POLICY "Coaches can view their notification history" ON public.notification_log
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = ((select current_setting('request.jwt.claims', true))::json ->> 'app_user_id')::integer
      AND u.role = ANY (ARRAY['admin','coach'])
  ));

-- 4. notification_log / Coaches can insert notification log
DROP POLICY IF EXISTS "Coaches can insert notification log" ON public.notification_log;
CREATE POLICY "Coaches can insert notification log" ON public.notification_log
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = ((select current_setting('request.jwt.claims', true))::json ->> 'app_user_id')::integer
      AND u.role = ANY (ARRAY['admin','coach'])
  ));
