CREATE TABLE IF NOT EXISTS public.notification_log (
  id BIGSERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES public.users(id),
  title TEXT NOT NULL,
  body TEXT,
  target_type TEXT NOT NULL CHECK (target_type IN ('group', 'user', 'all')),
  target_ids INTEGER[] DEFAULT '{}',
  recipient_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notif_log_sender ON public.notification_log(sender_id, created_at DESC);
