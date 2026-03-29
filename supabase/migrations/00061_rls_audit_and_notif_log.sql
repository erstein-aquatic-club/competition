-- RLS for admin_audit_log
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view audit log" ON public.admin_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (current_setting('request.jwt.claims', true)::json->>'app_user_id')::int
        AND u.role IN ('admin', 'coach', 'comite')
    )
  );

CREATE POLICY "System can insert audit log" ON public.admin_audit_log
  FOR INSERT WITH CHECK (true);

-- RLS for notification_log
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view their notification history" ON public.notification_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (current_setting('request.jwt.claims', true)::json->>'app_user_id')::int
        AND u.role IN ('admin', 'coach')
    )
  );

CREATE POLICY "Coaches can insert notification log" ON public.notification_log
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (current_setting('request.jwt.claims', true)::json->>'app_user_id')::int
        AND u.role IN ('admin', 'coach')
    )
  );
