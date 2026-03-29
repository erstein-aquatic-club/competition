CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_id INTEGER NOT NULL REFERENCES public.users(id),
  action TEXT NOT NULL,
  target_user_id INTEGER REFERENCES public.users(id),
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_created ON public.admin_audit_log(created_at DESC);
